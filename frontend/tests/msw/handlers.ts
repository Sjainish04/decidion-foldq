import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import foldResponse from "./fold-response.json";
import metaResponse from "./meta-response.json";

export const handlers = [
  http.get("*/api/v1/meta", () => HttpResponse.json(metaResponse)),
  http.post("*/api/v1/fold", () => HttpResponse.json(foldResponse)),
];

export const server = setupServer(...handlers);
