export type BuildAssetUrlOptions = {
  url: string | null | undefined;
  updatedAt?: Date;
  previewToken?: number | null;
};

const appendQuery = (url: string, query: string) => {
  if (!query) {
    return url;
  }

  return url.includes("?") ? `${url}&${query}` : `${url}?${query}`;
};

export const buildAssetUrl = ({ url, updatedAt, previewToken }: BuildAssetUrlOptions): string => {
  if (!url) {
    return "";
  }

  const params = new URLSearchParams();

  if (typeof previewToken === "number" && previewToken >= 0) {
    params.set("preview", previewToken.toString());
  }

  if (updatedAt) {
    params.set("v", updatedAt.getTime().toString());
  }

  const query = params.toString();
  return appendQuery(url, query);
};
