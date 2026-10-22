import type { FastifyInstance } from "fastify";
import { getSeriesDetail } from "../services/seriesService.js";
import { isWikidataQid } from "../validation.js";

export async function seriesRoutes(app: FastifyInstance) {
  app.get<{ Params: { qid: string } }>("/api/series/:qid", async (req, reply) => {
    const { qid } = req.params;
    if (!isWikidataQid(qid)) {
      reply.code(400);
      return { error: `"${qid}" is not a Wikidata item id` };
    }
    const series = await getSeriesDetail(qid);

    if (!series) {
      reply.code(404);
      return { error: `No series found for ${qid}` };
    }

    return series;
  });
}
