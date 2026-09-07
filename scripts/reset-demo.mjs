import { copyFile } from "node:fs/promises";
for (const name of ["ProductCard", "Login", "MutableList"])
  await copyFile(
    new URL(
      `../examples/buggy-react-app/fixtures/${name}.tsx.txt`,
      import.meta.url,
    ),
    new URL(
      `../examples/buggy-react-app/src/components/${name}.tsx`,
      import.meta.url,
    ),
  );
console.log("Restored the three documented demo bugs.");
