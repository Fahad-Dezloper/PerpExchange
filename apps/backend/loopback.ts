/// send data to the queue which goes to the engine and return it back via pubsub
import type { ToEngine } from "commons";
import { createClient } from "redis";

const client = createClient();
client.connect();

const BACKEND_CONSUMER_GROUP = "backend-workers";

client.xGroupCreate("to-engine", BACKEND_CONSUMER_GROUP, "$", {
  MKSTREAM: true,
});
