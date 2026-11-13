import type { FastifyInstance } from "fastify";
import { buildAuthorGraph, buildAwardGraph, buildSubjectGraph, buildWorkGraph } from "../services/graphService.js";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isSubjectSlugInput } from "../validation.js";

const BUILDERS = {
  author: buildAuthorGraph,
  award: (id: string, _extra?: number) => buildAwardGraph(id),
  subject: buildSubjectGraph,
  work: buildWorkGraph,
} as const;

// Bounds the OL fetch a client can trigger.
const MAX_EXTRA = 100;

type GraphType = keyof typeof BUILDERS;

const ID_VALIDATORS: Partial<Record<GraphType, (id: string) => boolean>> = {
  author: isOpenLibraryAuthorId,
  subject: (slug) => isSubjectSlugInput(slug), // legacy slugs from old links still work
  work: isOpenLibraryWorkId,
};

function isGraphType(value: string): value is GraphType {
  return Object.hasOwn(BUILDERS, value);
}

export async function graphRoutes(app: FastifyInstance) {
  app.get<{ Params: { type: string; id: string } }>("/api/graph/:type/:id", async (req, reply) => {
    const { type, id } = req.params;

    if (!isGraphType(type)) {
      reply.code(400);
      return { error: `Unknown graph type "${type}". Expected one of: ${Object.keys(BUILDERS).join(", ")}` };
    }

    if (ID_VALIDATORS[type] && !ID_VALIDATORS[type](id)) {
      reply.code(400);
      return { error: `"${id}" is not a valid ${type} id` };
    }

    const extra = Math.min(Math.max(Math.trunc(Number((req.query as { extra?: string }).extra)) || 0, 0), MAX_EXTRA);
    const graph = await BUILDERS[type](id, extra);

    if (!graph) {
      reply.code(404);
      return { error: `No ${type} found for id ${id}` };
    }

    return graph;
  });
}
