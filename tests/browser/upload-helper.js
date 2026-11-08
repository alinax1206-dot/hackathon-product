export async function uploadRainfall(page) {
  await page.locator("#file").setInputFiles({
    name: "Rainfall by City.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "City,Rainfall\nSeattle,95\nPortland,78\nBoston,65\nAustin,42\nDenver,28",
    ),
  });
}
