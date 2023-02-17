const core = require("@actions/core");
const io = require("@actions/io");
const fs = require("fs");

function getBoolValue(name) {
  return ["true", "1", "yes", "y"].includes(
    core.getInput(name).trim().toLowerCase()
  );
}

async function main() {
  try {
    const keepGit = getBoolValue("keep-git");
    await fs.readdir(".", async (err, files) => {
      if (err) {
        throw new Error(`Failed to list files: ${err}`);
      }
      for (const file of files) {
        if (keepGit && file === ".git") {
          continue;
        }
        console.log(`Deleting ${file}`);
        await io.rmRF(file);
      }
    });
  } catch (error) {
    core.setFailed(error.message);
  }
}

main()
  .then(() => console.log("Finished"))
  .catch((err) => console.log(`Failed to delete files: ${err}`));
