import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import foldResponse from "./fold-response.json";
import metaResponse from "./meta-response.json";
import structuresResponse from "./structures-response.json";

export const handlers = [
  http.get("*/api/v1/meta", () => HttpResponse.json(metaResponse)),
  http.post("*/api/v1/fold", () => HttpResponse.json(foldResponse)),
  http.get("*/api/v1/structures/search", () => HttpResponse.json(structuresResponse)),
  http.get("*/api/v1/structures/:pdbId", () =>
    HttpResponse.json(structuresResponse.structures[0]),
  ),
];

export const server = setupServer(...handlers);
