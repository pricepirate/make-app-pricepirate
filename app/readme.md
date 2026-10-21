# PricePirate Price API

Look up current prices, offers and product details for EANs and marketplace product IDs on Idealo, Amazon, Google Shopping, bol.com, Klarna and PriceRunner.

## Connect

Create an API key in the [PricePirate dashboard](https://dashboard.pricepirate.com) under **API Keys** and paste it into a new connection. New accounts get 100 free credits. Each query costs 1 credit; failed queries are refunded.

## Modules

- **Get offers by EAN**: starts a job, waits up to about 4 minutes and returns one bundle per query with its offers.
- **Get product details by EAN**: same, with product details instead of offers.
- **Start a price job** and **Get job results**: for large batches. Start the job, then fetch the results later (for example after a Sleep module or in a second scenario). Results stay available for about 1 hour after the job finishes.
- **List jobs**, **Get account** and **Make an API call**.

Learn more about the [PricePirate Price API](https://pricepirate.com/en/price-api/) and read the [API documentation](https://pricepirate.com/docs/en/api/price-data/overview).
