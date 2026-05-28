export function generateItunesLink(
  titre: string,
  artiste: string,
  affiliateToken?: string
): string {
  const query = encodeURIComponent(`${artiste} ${titre}`);
  const base = `https://music.apple.com/search?term=${query}&media=music`;
  if (affiliateToken) {
    return `${base}&at=${affiliateToken}`;
  }
  return base;
}

export function generateAmazonLink(
  titre: string,
  artiste: string,
  associateTag?: string
): string {
  const query = encodeURIComponent(`${artiste} ${titre}`);
  const base = `https://www.amazon.fr/s?k=${query}&i=digital-music`;
  if (associateTag) {
    return `${base}&tag=${associateTag}`;
  }
  return base;
}
