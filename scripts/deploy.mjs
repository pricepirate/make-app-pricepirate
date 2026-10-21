#!/usr/bin/env node
// Builds the app from ./app and deploys it to Make through the SDK Apps API.
//
//   node scripts/deploy.mjs --check     resolve and validate only (no network)
//   node scripts/deploy.mjs             deploy (needs MAKE_API_TOKEN)
//
// Environment:
//   MAKE_API_TOKEN  Make API token with sdk-apps:read and sdk-apps:write
//   MAKE_ZONE       Make zone host, default eu1.make.com
//   MAKE_APP_NAME   App name in Make (or its prefix before Make's random suffix), default app/app.json "name"
//
// Files may contain {"$include": "shared/<file>.json"}. Inside an array, an
// included array is spliced in; anywhere else the object is replaced.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "app");
const MODULE_NAME = /^[a-zA-Z][0-9a-zA-Z]+[0-9a-zA-Z]$/;
const APP_NAME = /^[a-z][0-9a-z-]+[0-9a-z]$/;

function resolve(value) {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const resolved = resolve(item);
      return isInclude(item) && Array.isArray(resolved) ? resolved : [resolved];
    });
  }
  if (isInclude(value)) return resolve(JSON.parse(readFileSync(join(root, value.$include), "utf8")));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]));
  }
  return value;
}
const isInclude = (v) => v && typeof v === "object" && !Array.isArray(v) && typeof v.$include === "string";
const load = (...parts) => resolve(JSON.parse(readFileSync(join(root, ...parts), "utf8")));

function build() {
  const app = load("app.json");
  const modules = readdirSync(join(root, "modules")).sort().map((dir) => {
    const read = (f) => (existsSync(join(root, "modules", dir, f)) ? load("modules", dir, f) : undefined);
    const meta = read("module.json");
    if (meta.name !== dir) throw new Error(`modules/${dir}: name "${meta.name}" must match the folder`);
    if (!MODULE_NAME.test(meta.name) || meta.name.length > 48) throw new Error(`invalid module name ${meta.name}`);
    return { meta, api: read("api.json"), expect: read("expect.json") ?? [], parameters: read("parameters.json") ?? [],
             interface: read("interface.json") ?? [], samples: read("samples.json") };
  });
  const built = {
    app, modules,
    base: load("base.json"),
    common: load("common.json"),
    groups: load("groups.json"),
    connection: { meta: load("connections", "apikey", "connection.json"), api: load("connections", "apikey", "api.json"),
                  parameters: load("connections", "apikey", "parameters.json") },
    readme: existsSync(join(root, "readme.md")) ? readFileSync(join(root, "readme.md"), "utf8") : undefined,
    icon: readFileSync(join(root, "icon.png")),
  };
  if (!APP_NAME.test(app.name)) throw new Error(`invalid app name ${app.name}`);
  if (JSON.stringify(built).includes("$include")) throw new Error("unresolved $include");
  const grouped = built.groups.flatMap((g) => g.modules).sort();
  const names = modules.map((m) => m.meta.name).sort();
  if (JSON.stringify(grouped) !== JSON.stringify(names)) throw new Error(`groups ${grouped} do not match modules ${names}`);
  if (modules.filter((m) => m.meta.typeId === 12).length !== 1) throw new Error("exactly one universal module required");
  return built;
}

async function deploy(built) {
  const token = process.env.MAKE_API_TOKEN;
  if (!token) throw new Error("MAKE_API_TOKEN is not set");
  const zone = process.env.MAKE_ZONE || "eu1.make.com";
  const api = `https://${zone}/api/v2`;
  let appName = process.env.MAKE_APP_NAME || built.app.name;
  const version = built.app.version ?? 1;

  async function call(method, path, body, contentType = "application/json") {
    const res = await fetch(api + path, {
      method,
      headers: { Authorization: `Token ${token}`, ...(body !== undefined && { "Content-Type": contentType }) },
      body: body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 500)}`);
    return text ? JSON.parse(text) : {};
  }

  // Make appends a random suffix to new app names, e.g. pricepirate-price-api-wgy97z.
  const { apps } = await call("GET", "/sdk/apps");
  const existing = apps.find((a) => a.name === appName || a.name.startsWith(`${appName}-`));
  if (existing) appName = existing.name;
  if (!existing) {
    const { name, label, description, theme, language, countries } = built.app;
    const created = await call("POST", "/sdk/apps", { name, label, description, theme, language, countries, version });
    appName = created.app?.name ?? appName;
    console.log(`created app ${appName}`);
  } else {
    const { label, description, theme } = built.app;
    await call("PATCH", `/sdk/apps/${appName}/${version}`, { label, description, theme });
  }
  const app = `/sdk/apps/${appName}/${version}`;

  await call("PUT", `${app}/common`, built.common);
  await call("PUT", `${app}/base`, built.base);
  await call("PUT", `${app}/icon`, built.icon, "image/png");
  if (built.readme) await call("PUT", `${app}/readme`, built.readme, "text/markdown");

  const { appConnections = [] } = await call("GET", `/sdk/apps/${appName}/connections`);
  // The app has one connection. Make stores API-key connections with type "basic".
  let connection = appConnections.map((c) => c.name).sort()[0];
  if (!connection) {
    const created = await call("POST", `/sdk/apps/${appName}/connections`, built.connection.meta);
    connection = created.appConnection?.name;
    console.log(`created connection ${connection}`);
  }
  await call("PATCH", `/sdk/apps/connections/${connection}`, { label: built.connection.meta.label });
  await call("PUT", `/sdk/apps/connections/${connection}/api`, built.connection.api);
  await call("PUT", `/sdk/apps/connections/${connection}/parameters`, built.connection.parameters);

  const { appModules = [] } = await call("GET", `${app}/modules`);
  for (const m of built.modules) {
    const { name, typeId, label, description } = m.meta;
    if (!appModules.some((x) => x.name === name)) {
      await call("POST", `${app}/modules`, { name, typeId, label, description, connection, moduleInitMode: "blank" });
      console.log(`created module ${name}`);
    } else {
      await call("PATCH", `${app}/modules/${name}`, { label, description, connection });
    }
    const mod = `${app}/modules/${name}`;
    await call("PUT", `${mod}/api`, m.api);
    await call("PUT", `${mod}/expect`, m.expect);
    await call("PUT", `${mod}/parameters`, m.parameters);
    await call("PUT", `${mod}/interface`, m.interface);
    if (m.samples) await call("PUT", `${mod}/samples`, m.samples);
  }
  await call("PUT", `${app}/groups`, built.groups);
  console.log(`deployed ${appName} v${version}: ${built.modules.length} modules, connection ${connection}`);
}

const built = build();
if (process.argv.includes("--check")) {
  console.log(`ok: ${built.app.label}, ${built.modules.length} modules`);
} else {
  await deploy(built);
}
