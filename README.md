# PricePirate for Make

A [Make](https://www.make.com) custom app ("PricePirate") for the [PricePirate Price API](https://pricepirate.com/en/price-api/): current prices, offers and product details for EANs and marketplace product IDs on Idealo, Amazon, Google Shopping, bol.com, Klarna and PriceRunner.

Maintained by UCX Media – Sergei Gaponik. Support: info@gaponik.com.

## Modules

| Module | Type | What it does |
| --- | --- | --- |
| Get offers by EAN | Search | Starts a job, waits up to about 4 minutes, returns one bundle per query with an `offers` array. |
| Get product details by EAN | Search | Same, one bundle per query with product details (description, images, categories, ratings, price range). |
| Start a price job | Action | Starts a job and returns its `job_id` without waiting. |
| Get job results | Search | Returns a finished job, one bundle per query with product details and offers. |
| List jobs | Search | Your job history, with cursor pagination. |
| Get account | Action | Credit balance, limits and entitlements. |
| Make an API call | Universal | Any authorized call relative to `https://api-v2.pricepirate.com`. |

Every query returns a bundle, including queries that were `not_found` or failed (`status`, `error`, `errorCode`). Turn on **Skip queries without offers** to drop them. Use Make's Iterator on `offers` to get one bundle per offer.

### Waiting and large batches

Make stops a module after 300 seconds. The waiting modules poll `GET /api/v2/jobs/{id}?omit_partials=true` every 5 seconds, up to 48 times, then make one final poll that returns the results and settles refunds. If the job is still running, the module fails with the job ID; fetch it later with **Get job results** within about 1 hour. Jobs usually take 1–2 minutes and can take up to about 15, so for large batches use **Start a price job**, then **Get job results** after a Sleep module or in a second scenario.

## Repository layout

```
app/
  app.json, base.json, common.json, groups.json, readme.md, icon.png
  connections/apikey/   connection test and fields
  modules/<name>/       module.json, api.json, expect.json, interface.json
  shared/               request and field definitions used by several modules
scripts/deploy.mjs      resolves {"$include": "shared/…"} and deploys through the Make SDK Apps API
scenarios/              test scenario blueprints (no credentials)
```

## Development

```sh
node scripts/deploy.mjs --check                                  # resolve and validate, no network
MAKE_API_TOKEN=… MAKE_ZONE=eu1.make.com node scripts/deploy.mjs  # deploy to Make
```

The token needs the `sdk-apps:read` and `sdk-apps:write` scopes. Make appends a random suffix to new app names (`pricepirate-price-api-xxxxxx`); the script finds the app by its name prefix.

Requests send `x-api-key` and `x-pricepirate-integration: make`. The key is sanitized from Make's logs.

## License

[MIT](LICENSE)
