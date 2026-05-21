// Phase 1.1: schema is intentionally empty modulo Apollo Federation
// placeholders. Apollo Router rejects subgraphs with zero queries/mutations,
// so `_aiPing` / `_aiNoop` keep the subgraph composable while we ship no real
// surface. Phase 1.2 replaces these with Provider/Model/Budget types.
//
// `_Empty` is here as a defensive placeholder type — Federation tooling has
// historically been picky about subgraphs with no concrete types beyond
// the extended Query/Mutation roots.

export const types = `
  type _Empty {
    _: Boolean
  }
`;

export const queries = `
  _aiPing: Boolean
`;

export const mutations = `
  _aiNoop: Boolean
`;

export default { types, queries, mutations };
