import type { FastifyInstance } from "fastify";
import { buildAuthorGraph, buildSubjectGraph, buildWorkGraph } from "../services/graphService.js";

const BUILDERS = {
  author: buildAuthorGraph,
  subject: buildSubjectGraph,
  work: buildWorkGraph,
} as const;

type GraphType = keyof typeof BUILDERS;

function isGraphType(value: string): value is GraphType {
  return value in BUILDERS;
}

export async function graphRoutes(app: FastifyInstance) {
  app.get<{ Params: { type: string; id: string } }>("/api/graph/:type/:id", async (req, reply) => {
    const { type, id } = req.params;

    if (!isGraphType(type)) {
      reply.code(400);
      return { error: `Unknown graph type "${type}". Expected one of: ${Object.keys(BUILDERS).join(", ")}` };
    }

    const graph = await BUILDERS[type](id);

    if (!graph) {
      reply.code(404);
      return { error: `No ${type} found for id ${id}` };
    }

    return graph;
  });
}
