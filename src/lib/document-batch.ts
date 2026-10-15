export type BatchResult<T> = { success: true; value: T } | { success: false; message: string };
/** Sequential requests preserve duplicate checks and isolate individual failures. */
export async function runDocumentBatch<Item, Value>(items: readonly Item[], process: (item: Item) => Promise<Value>, onResult: (index: number, result: BatchResult<Value>) => void) {
  for (let index = 0; index < items.length; index++) {
    let result: BatchResult<Value>;
    try { result = { success: true, value: await process(items[index]) }; }
    catch (error) { result = { success: false, message: error instanceof Error ? error.message : "İşlem tamamlanamadı." }; }
    onResult(index, result);
  }
}
