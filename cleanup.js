const core = require('@actions/core');
const io = require('@actions/io');
const fs = require('fs');

async function main() {
  try {
    await fs.readdir('.', async (err, files) => {
      if (err) {
        throw new Error(`Failed to list files: ${err}`);
      }
      for (const file of files) {
        console.log(`Deleting ${file}`);
        await io.rmRF(file);
      }
    })
  } catch (error) {
    core.setFailed(error.message);
  }
}

main()
  .then(() => console.log("Finished"))
  .catch(err => console.log(`Failed to delete files: ${err}`));
