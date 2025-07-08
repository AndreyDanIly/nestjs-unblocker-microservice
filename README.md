# “Human” Anti-bot Unblocker Microservice

This project is a microservice built with NestJS and Puppeteer, designed to scrape websites behind PerimeterX. 
It achieves this by using a multi-layered approach that first mimics a real human user-agent and then blocks PerimeterX initialization script.

# Prerequisites

- Docker installed and running on your machine.
- Node.js (v24+) and npm for local development outside of Docker.

# Getting Started

First, clone this repository and navigate into the project directory. Then, build the Docker image using the following command.

```bash
docker build -t nestjs-app . 
```

Second, run the Docker Container.

```bash
docker run --rm -p 127.0.0.1:3003:3003 nestjs-app
```


# Usage

The unlock endpoint is located at `unblock`


The service exposes a single endpoint to fetch website content.

## Endpoint

`POST /unblock`

## Request Body

The request body must be a JSON object with the following properties:

| Field    | Type    | Required | Description                                  |
| -------- | ------- | -------- | -------------------------------------------- |
| `url`    | `string`| `true`   | The full URL of the page you want to scrape. |
| `render` | `boolean`| `false`  | (Future use) Not currently implemented.      |

## Example Request (`curl`)

```bash
curl -X POST http://localhost:3003/unblock \
     -H "Content-Type: application/json" \
     -d '{
           "url": "https://www.zillow.com/longisland-catawba-nc/"
         }'
```

```bash
curl -X POST http://localhost:3003/unblock -H "Content-Type: application/json" -d '{
    "url": "https://www.zillow.com/longisland-catawba-nc/",
    "render": true
}'
```

## Example Error Response (Status `504`)

If the page takes too long to load, the service will return a timeout error.

```json
{
  "html": null,
  "status": 504,
  "error": "Navigation timed out after 60s. The target page is likely too slow or unresponsive.",
  "finalUrl": "https://www.zillow.com/longisland-catawba-nc/"
}
```