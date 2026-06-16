import { genericH5NovelAdapter } from "./genericH5NovelAdapter.js";
import { novelMasterAdapter } from "./sites/novelMaster.js";
import { novelmusterAdapter } from "./sites/novelmuster.js";
import { obnovelAdapter } from "./sites/obnovel.js";
import { ocereadAdapter } from "./sites/oceread.js";
import { unlimitedNovelsAdapter } from "./sites/unlimitedNovels.js";
import type { NovelAdapter } from "./types.js";

/** Site-specific adapters are checked before the generic fallback. */
const SITE_ADAPTERS: NovelAdapter[] = [
  obnovelAdapter,
  unlimitedNovelsAdapter,
  novelmusterAdapter,
  ocereadAdapter,
  novelMasterAdapter,
];

export const getAdapterForUrl = (sourceUrl: string): NovelAdapter => {
  const url = new URL(sourceUrl);

  return SITE_ADAPTERS.find((adapter) => adapter.canHandle(url)) ?? genericH5NovelAdapter;
};
