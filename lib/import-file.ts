/** Keep large CSV bodies below the same-origin proxy limit without changing data. */
export async function prepareImportFile(file: File): Promise<File> {
  if (!/\.csv$/i.test(file.name) || file.size < 4 * 1024 * 1024) return file;
  if (typeof CompressionStream === "undefined") {
    throw new Error("For large files, upload a .csv.gz file or use a browser supporting CSV compression.");
  }
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  const blob = await new Response(stream).blob();
  return new File([blob], file.name + ".gz", {type: "application/gzip", lastModified: file.lastModified});
}
