import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { masterDataRoutes } from "./routes/masterData.js";
import { gameBundleRoutes } from "./routes/gameBundle.js";
import { childRowRoutes } from "./routes/childRows.js";
import { rosterRoutes } from "./routes/roster.js";
import { augmentRoutes } from "./routes/augments.js";
import { teamRoutes } from "./routes/teams.js";
import { gameSettingsRoutes } from "./routes/gameSettings.js";
import { inventoryRoutes } from "./routes/inventory.js";
import { incomeSourceRoutes } from "./routes/incomeSources.js";
import { farmRouteRoutes } from "./routes/farmRoute.js";
import { pullLogRoutes } from "./routes/pullLog.js";
import { taskRoutes } from "./routes/tasks.js";
import { eventProgressRoutes } from "./routes/eventProgress.js";
import { redeemCodeRoutes } from "./routes/redeemCodes.js";
import { battlePassProgressRoutes } from "./routes/battlePassProgress.js";
import { wishlistRoutes } from "./routes/wishlist.js";
import { savingsRuleRoutes } from "./routes/savingsRules.js";
import { purchaseRoutes } from "./routes/purchases.js";
import { spendSubscriptionRoutes } from "./routes/spendSubscriptions.js";
import { spendBudgetRoutes } from "./routes/spendBudgets.js";
import { syncRoutes } from "./routes/sync.js";
import "./db/client.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(multipart);

await app.register(fastifyStatic, {
  root: config.imagesDir,
  prefix: "/images/",
  decorateReply: false,
});

if (fs.existsSync(config.webDistDir)) {
  await app.register(fastifyStatic, {
    root: config.webDistDir,
    prefix: "/",
    decorateReply: true,
  });
}

await app.register(healthRoutes);
await app.register(masterDataRoutes);
await app.register(gameBundleRoutes);
await app.register(childRowRoutes);
await app.register(rosterRoutes);
await app.register(augmentRoutes);
await app.register(teamRoutes);
await app.register(gameSettingsRoutes);
await app.register(inventoryRoutes);
await app.register(incomeSourceRoutes);
await app.register(farmRouteRoutes);
await app.register(pullLogRoutes);
await app.register(taskRoutes);
await app.register(eventProgressRoutes);
await app.register(redeemCodeRoutes);
await app.register(battlePassProgressRoutes);
await app.register(wishlistRoutes);
await app.register(savingsRuleRoutes);
await app.register(purchaseRoutes);
await app.register(spendSubscriptionRoutes);
await app.register(spendBudgetRoutes);
await app.register(syncRoutes);

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`API listening on :${config.port} (game=${config.game})`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
