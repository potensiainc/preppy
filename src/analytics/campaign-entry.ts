export type CampaignEntry = "BUBUILD_EK_VIDEO" | "OTHER";

const ENTRY_STORAGE_KEY = "preppy.campaign-entry.v1";

/**
 * Maps the landing URL's campaign parameters to an allowlisted label. Only the
 * label is ever sent to analytics; the URL, path and other query values are not.
 */
export function campaignEntryFromSearch(search: string): CampaignEntry {
  const params = new URLSearchParams(search);
  return params.get("utm_source") === "youtube" &&
    params.get("utm_campaign") === "bubuild_ek_video"
    ? "BUBUILD_EK_VIDEO"
    : "OTHER";
}

/**
 * Keeps the campaign label for later pages in the same tab. A URL that carries
 * its own campaign parameters replaces the stored label, even with OTHER.
 */
export function resolveCampaignEntry(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | null,
): CampaignEntry {
  const params = new URLSearchParams(search);
  const hasCampaign = params.has("utm_source") || params.has("utm_campaign");
  const fromUrl = campaignEntryFromSearch(search);
  try {
    if (hasCampaign) {
      storage?.setItem(ENTRY_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return storage?.getItem(ENTRY_STORAGE_KEY) === "BUBUILD_EK_VIDEO"
      ? "BUBUILD_EK_VIDEO"
      : "OTHER";
  } catch {
    return fromUrl;
  }
}

export function browserCampaignEntry(): CampaignEntry {
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  return resolveCampaignEntry(window.location.search, storage);
}
