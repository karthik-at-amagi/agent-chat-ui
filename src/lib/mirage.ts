/**
 * Service to fetch asset URLs from the Mirage service.
 */

export async function fetchAssetUrl(
  assetId: string,
  accountId: string,
): Promise<string | null> {
  const baseUrl = process.env.NEXT_PUBLIC_VIDEO_BACKEND_URL;
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_VIDEO_BACKEND_URL is not defined");
    return null;
  }

  // The backend is responsible for resolving the asset_id to a URL
  // or we can construct the path if we know the pattern.
  // Based on ToolResult logic, the pattern is: /asset_files/{asset_id}.mp4
  // But for Mirage, we might need to call the Mirage API.

  // Let's assume we call the Mirage API directly if we have the URL,
  // or we use the backend proxy.

  // For now, let's implement the logic described in the plan:
  // https://mirage.demo.eka.amagi.tv:8443/api/v1/index/custom?ext_asset_id=${assetId}&indexers=sumcon

  const mirageBaseUrl =
    "https://mirage.demo.eka.amagi.tv:8443/api/v1/index/custom";
  const url = new URL(mirageBaseUrl);
  url.searchParams.set("ext_asset_id", assetId);
  url.searchParams.set("indexers", "sumcon");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "Content-Type": "application/json",
        "x-account-id": accountId,
      },
    });

    if (!response.ok) {
      console.error(
        `Failed to fetch asset URL for ${assetId}: ${response.statusText}`,
      );
      return null;
    }

    const data = await response.json();
    return data.asset_url || null;
  } catch (error) {
    console.error(`Error fetching asset URL for ${assetId}:`, error);
    return null;
  }
}
