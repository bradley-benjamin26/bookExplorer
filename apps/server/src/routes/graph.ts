import { slugifySubject } from "@book-explorer/shared";
import type { FastifyInstance } from "fastify";
import { buildAuthorGraph, buildSubjectGraph, buildWorkGraph } from "../services/graphService.js";
import { isOpenLibraryAuthorId, isOpenLibraryWorkId, isSubjectSlug } from "../validation.js";

const BUILDERS = {
  author: buildAuthorGraph,
  subject: buildSubjectGraph,
  work: buildWorkGraph,
} as const;

type GraphType = keyof typeof BUILDERS;

const ID_VALIDATORS: Partial<Record<GraphType, (id: string) => boolean>> = {
  author: isOpenLibraryAuthorId,
  subject: (slug) => isSubjectSlug(slugifySubject(slug)), // legacy slugs from old links still work
  work: isOpenLibraryWorkId,
};

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

    if (ID_VALIDATORS[type] && !ID_VALIDATORS[type](id)) {
      reply.code(400);
      return { error: `"${id}" is not a valid ${type} id` };
    }

    const graph = await BUILDERS[type](id);

    if (!graph) {
      reply.code(404);
      return { error: `No ${type} found for id ${id}` };
    }

    return graph;
  });
}
