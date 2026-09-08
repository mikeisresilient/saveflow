import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SAVEFLOW_TEMP_DIRECTORY =
  path.join(os.tmpdir(), "saveflow");

const MAX_TEMP_AGE_MS =
  60 * 60 * 1000;

export async function cleanupOldTempFiles(): Promise<void> {
  try {
    await fs.mkdir(
      SAVEFLOW_TEMP_DIRECTORY,
      {
        recursive: true,
      }
    );

    const entries = await fs.readdir(
      SAVEFLOW_TEMP_DIRECTORY,
      {
        withFileTypes: true,
      }
    );

    const now = Date.now();

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const directoryPath = path.join(
        SAVEFLOW_TEMP_DIRECTORY,
        entry.name
      );

      try {
        const stats = await fs.stat(
          directoryPath
        );

        const age =
          now - stats.mtimeMs;

        if (age > MAX_TEMP_AGE_MS) {
          await fs.rm(
            directoryPath,
            {
              recursive: true,
              force: true,
            }
          );

          console.log(
            `Removed old temporary directory: ${entry.name}`
          );
        }
      } catch (error) {
        console.error(
          `Unable to inspect temporary directory ${entry.name}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error(
      "Temporary file cleanup failed:",
      error
    );
  }
}