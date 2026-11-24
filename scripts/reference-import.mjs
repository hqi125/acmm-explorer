#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const OUTPUT_PATH = path.resolve(process.env.ACMM_REFERENCE_OUTPUT ?? "src/reference/generated/schema-catalog.json");
const CATALOG_SCHEMA = "acmm-explorer-schema-catalog/0.2";
const PACKAGE_YAML_NAMES = new Set(["experiment.yaml", "experiment-package.yaml"]);

const SOURCE_DEFINITIONS = [
  {
    id: "core",
    label: "Core",
    root: path.resolve(process.env.ACMM_CORE_SOURCE ?? "/sources/core"),
  },
  {
    id: "experiments",
    label: "Experiments",
    root: path.resolve(process.env.ACMM_EXPERIMENTS_SOURCE ?? "/sources/experiments"),
  },
];

const SKIP_DIRECTORIES = new Set([
  ".git",
  ".idea",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  ".tox",
  ".venv",
  ".vscode",
  "__pycache__",
  "build",
  "dist",
  "node_modules",
  "reports",
  "results",
  "tmp",
  "venv",
]);

function toPosix(value)
{
  return value.split(path.sep).join("/");
}

function sha256(buffer)
{
  return createHash("sha256").update(buffer).digest("hex");
}

function isPlainObject(value)
{
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function looksLikeJsonSchema(document, relativePath)
{
  if (!isPlainObject(document))
  {
    return false;
  }

  if (typeof document.$schema === "string")
  {
    return true;
  }

  const schemaKeywords = ["properties", "$defs", "definitions", "allOf", "anyOf", "oneOf", "required", "additionalProperties"];
  const keywordCount = schemaKeywords.reduce((count, key) => count + (key in document ? 1 : 0), 0);
  const pathSuggestsSchema = /(^|[._/-])schema([._/-]|$)/i.test(relativePath);

  if (pathSuggestsSchema && keywordCount > 0)
  {
    return true;
  }

  return keywordCount >= 2 && (document.type !== undefined || document.$id !== undefined);
}

async function walkFiles(root, predicate)
{
  const results = [];

  async function walk(current)
  {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries)
    {
      if (entry.isDirectory())
      {
        if (!SKIP_DIRECTORIES.has(entry.name))
        {
          await walk(path.join(current, entry.name));
        }
        continue;
      }

      if (entry.isFile() && predicate(entry.name, current))
      {
        results.push(path.join(current, entry.name));
      }
    }
  }

  await walk(root);
  return results;
}

async function walkJsonFiles(root)
{
  return walkFiles(root, (name) => name.toLowerCase().endsWith(".json"));
}

async function walkPackageYamlFiles(root)
{
  return walkFiles(root, (name) => PACKAGE_YAML_NAMES.has(name.toLowerCase()));
}

async function readGitCommit(repoRoot)
{
  const dotGit = path.join(repoRoot, ".git");
  let gitDir = dotGit;

  try
  {
    const dotGitStat = await stat(dotGit);
    if (dotGitStat.isFile())
    {
      const pointer = (await readFile(dotGit, "utf8")).trim();
      const match = /^gitdir:\s*(.+)$/i.exec(pointer);
      if (!match)
      {
        return null;
      }
      gitDir = path.resolve(repoRoot, match[1]);
    }
  }
  catch
  {
    return null;
  }

  try
  {
    const head = (await readFile(path.join(gitDir, "HEAD"), "utf8")).trim();
    if (!head.startsWith("ref:"))
    {
      return /^[0-9a-f]{40,64}$/i.test(head) ? head : null;
    }

    const ref = head.slice(4).trim();
    try
    {
      const direct = (await readFile(path.join(gitDir, ...ref.split("/")), "utf8")).trim();
      if (/^[0-9a-f]{40,64}$/i.test(direct))
      {
        return direct;
      }
    }
    catch
    {
      // Fall through to packed-refs.
    }

    try
    {
      const packed = await readFile(path.join(gitDir, "packed-refs"), "utf8");
      for (const line of packed.split(/\r?\n/))
      {
        if (line.startsWith("#") || line.startsWith("^"))
        {
          continue;
        }
        const [commit, packedRef] = line.trim().split(/\s+/);
        if (packedRef === ref && /^[0-9a-f]{40,64}$/i.test(commit))
        {
          return commit;
        }
      }
    }
    catch
    {
      return null;
    }
  }
  catch
  {
    return null;
  }

  return null;
}

function decodePointerToken(token)
{
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function resolveJsonPointer(document, pointer)
{
  if (pointer === "" || pointer === "#")
  {
    return document;
  }

  const normalized = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  if (!normalized.startsWith("/"))
  {
    return undefined;
  }

  let current = document;
  for (const token of normalized.slice(1).split("/").map(decodePointerToken))
  {
    if (!isPlainObject(current) && !Array.isArray(current))
    {
      return undefined;
    }
    current = current[token];
    if (current === undefined)
    {
      return undefined;
    }
  }
  return current;
}

function mergeSchemaNodes(base, overlay)
{
  if (!isPlainObject(base))
  {
    return isPlainObject(overlay) ? { ...overlay } : overlay;
  }
  if (!isPlainObject(overlay))
  {
    return { ...base };
  }

  const merged = { ...base, ...overlay };
  if (isPlainObject(base.properties) || isPlainObject(overlay.properties))
  {
    merged.properties = { ...(base.properties ?? {}), ...(overlay.properties ?? {}) };
  }
  if (Array.isArray(base.required) || Array.isArray(overlay.required))
  {
    merged.required = [...new Set([...(base.required ?? []), ...(overlay.required ?? [])])];
  }
  return merged;
}

function resolveReference(ref, documentPath, documents)
{
  if (typeof ref !== "string")
  {
    return null;
  }

  const hashIndex = ref.indexOf("#");
  const filePart = hashIndex >= 0 ? ref.slice(0, hashIndex) : ref;
  const pointerPart = hashIndex >= 0 ? ref.slice(hashIndex) : "#";
  const targetPath = filePart.length === 0 ? documentPath : path.resolve(path.dirname(documentPath), filePart);
  const targetDocument = documents.get(targetPath)?.document;
  if (!targetDocument)
  {
    return null;
  }

  const node = resolveJsonPointer(targetDocument, pointerPart);
  if (!isPlainObject(node))
  {
    return null;
  }

  return { node, targetPath, pointer: pointerPart };
}

function effectiveNode(node, documentPath, documents, seen = new Set())
{
  if (!isPlainObject(node))
  {
    return {};
  }

  let result = { ...node };

  if (typeof node.$ref === "string")
  {
    const key = `${documentPath}::${node.$ref}`;
    if (!seen.has(key))
    {
      const resolved = resolveReference(node.$ref, documentPath, documents);
      if (resolved)
      {
        const nextSeen = new Set(seen);
        nextSeen.add(key);
        result = mergeSchemaNodes(effectiveNode(resolved.node, resolved.targetPath, documents, nextSeen), result);
      }
    }
  }

  if (Array.isArray(node.allOf))
  {
    for (const branch of node.allOf)
    {
      result = mergeSchemaNodes(result, effectiveNode(branch, documentPath, documents, seen));
    }
  }

  return result;
}

function inferTypes(node)
{
  const values = [];
  if (typeof node.type === "string")
  {
    values.push(node.type);
  }
  else if (Array.isArray(node.type))
  {
    values.push(...node.type.filter((value) => typeof value === "string"));
  }

  for (const keyword of ["oneOf", "anyOf"])
  {
    if (Array.isArray(node[keyword]))
    {
      for (const branch of node[keyword])
      {
        if (isPlainObject(branch) && typeof branch.type === "string")
        {
          values.push(branch.type);
        }
      }
    }
  }

  return [...new Set(values)];
}

function extractConstraints(node)
{
  const keys = [
    "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
    "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems",
    "minProperties", "maxProperties", "additionalProperties",
  ];
  const result = {};
  for (const key of keys)
  {
    if (node[key] !== undefined && (typeof node[key] !== "object" || node[key] === null))
    {
      result[key] = node[key];
    }
  }
  return result;
}

function pointerEscape(value)
{
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}

function yamlValueType(value)
{
  if (value === null)
  {
    return "null";
  }
  if (Array.isArray(value))
  {
    return "array";
  }
  if (isPlainObject(value))
  {
    return "object";
  }
  if (typeof value === "number")
  {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
}

function collectYamlFields(documentRecord, document)
{
  const fields = new Map();

  function recordField(name, fieldPath, value)
  {
    const type = yamlValueType(value);
    const existing = fields.get(fieldPath);
    if (existing)
    {
      if (!existing.types.includes(type))
      {
        existing.types.push(type);
      }
      return existing;
    }

    const field = {
      id: `${documentRecord.id}::field::${fieldPath}`,
      documentId: documentRecord.id,
      packageId: documentRecord.packageId,
      name,
      path: fieldPath,
      types: [type],
    };
    fields.set(fieldPath, field);
    return field;
  }

  function visit(value, currentPath)
  {
    if (isPlainObject(value))
    {
      for (const [key, child] of Object.entries(value))
      {
        const childPath = currentPath.length > 0 ? `${currentPath}.${key}` : key;
        recordField(key, childPath, child);
        if (Array.isArray(child))
        {
          for (const item of child)
          {
            visit(item, `${childPath}[]`);
          }
        }
        else if (isPlainObject(child))
        {
          visit(child, childPath);
        }
      }
      return;
    }

    if (Array.isArray(value))
    {
      for (const item of value)
      {
        visit(item, `${currentPath}[]`);
      }
    }
  }

  visit(document, "");
  return [...fields.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function packageLabel(relativeRoot)
{
  if (relativeRoot === "." || relativeRoot.length === 0)
  {
    return "experiment-package-root";
  }
  return path.posix.basename(relativeRoot);
}

function stringifyValue(value)
{
  if (value === undefined)
  {
    return undefined;
  }
  return value;
}

function collectFields(schemaRecord, rootDocument, documentPath, documents, startNode = rootDocument, startPath = "", startPointer = "#")
{
  const fields = new Map();

  function visitObject(node, currentPath, pointer, inheritedRequired = new Set(), conditional = false, seen = new Set())
  {
    const effective = effectiveNode(node, documentPath, documents, seen);
    const required = new Set([...(inheritedRequired ?? []), ...(Array.isArray(effective.required) ? effective.required : [])]);
    const properties = isPlainObject(effective.properties) ? effective.properties : {};

    for (const [propertyName, rawProperty] of Object.entries(properties))
    {
      if (!isPlainObject(rawProperty))
      {
        continue;
      }

      const propertyPointer = `${pointer}/properties/${pointerEscape(propertyName)}`;
      const propertyPath = currentPath.length > 0 ? `${currentPath}.${propertyName}` : propertyName;
      const resolved = effectiveNode(rawProperty, documentPath, documents, seen);
      const types = inferTypes(resolved);
      const key = `${propertyPath}::${propertyPointer}`;
      const existing = fields.get(key);
      const requiredHere = required.has(propertyName);
      const entry = {
        id: `${schemaRecord.id}::field::${propertyPath}::${propertyPointer}`,
        schemaId: schemaRecord.id,
        name: propertyName,
        path: propertyPath,
        pointer: propertyPointer,
        title: typeof resolved.title === "string" ? resolved.title : null,
        description: typeof resolved.description === "string" ? resolved.description : null,
        types,
        required: requiredHere && !conditional,
        conditional: conditional || (requiredHere && conditional),
        default: stringifyValue(resolved.default),
        enum: Array.isArray(resolved.enum) ? resolved.enum : null,
        const: stringifyValue(resolved.const),
        format: typeof resolved.format === "string" ? resolved.format : null,
        ref: typeof rawProperty.$ref === "string" ? rawProperty.$ref : null,
        constraints: extractConstraints(resolved),
      };

      if (!existing)
      {
        fields.set(key, entry);
      }
      else
      {
        existing.required = existing.required || entry.required;
        existing.conditional = existing.conditional || entry.conditional;
        existing.types = [...new Set([...existing.types, ...entry.types])];
        existing.description ??= entry.description;
        existing.title ??= entry.title;
      }

      const isArray = types.includes("array") || resolved.items !== undefined;
      if (isArray && isPlainObject(resolved.items))
      {
        visitObject(resolved.items, `${propertyPath}[]`, `${propertyPointer}/items`, new Set(), conditional, seen);
      }
      else
      {
        visitObject(resolved, propertyPath, propertyPointer, new Set(), conditional, seen);
      }
    }

    for (const keyword of ["oneOf", "anyOf"])
    {
      if (Array.isArray(effective[keyword]))
      {
        for (let index = 0; index < effective[keyword].length; index += 1)
        {
          const branch = effective[keyword][index];
          if (isPlainObject(branch))
          {
            visitObject(branch, currentPath, `${pointer}/${keyword}/${index}`, new Set(), true, seen);
          }
        }
      }
    }
  }

  visitObject(startNode, startPath, startPointer, new Set(), false, new Set());
  return [...fields.values()].sort((left, right) => left.path.localeCompare(right.path) || left.pointer.localeCompare(right.pointer));
}

function collectDefinitions(schemaRecord, document)
{
  const definitions = [];
  for (const key of ["$defs", "definitions"])
  {
    const group = document[key];
    if (!isPlainObject(group))
    {
      continue;
    }

    for (const [name, node] of Object.entries(group))
    {
      if (!isPlainObject(node))
      {
        continue;
      }
      definitions.push({
        id: `${schemaRecord.id}::definition::${key}.${name}`,
        name,
        pointer: `#/${pointerEscape(key)}/${pointerEscape(name)}`,
        title: typeof node.title === "string" ? node.title : null,
        description: typeof node.description === "string" ? node.description : null,
        types: inferTypes(node),
      });
    }
  }
  return definitions;
}

async function loadSource(source)
{
  const rootStat = await stat(source.root);
  if (!rootStat.isDirectory())
  {
    throw new Error(`${source.label} source is not a directory: ${source.root}`);
  }

  const jsonPaths = await walkJsonFiles(source.root);
  const packageYamlPaths = source.id === "experiments" ? await walkPackageYamlFiles(source.root) : [];
  const documents = new Map();
  for (const absolutePath of jsonPaths)
  {
    let raw;
    try
    {
      raw = await readFile(absolutePath);
      const document = JSON.parse(raw.toString("utf8"));
      documents.set(absolutePath, { raw, document });
    }
    catch
    {
      // Non-JSON or malformed JSON files are not schema candidates.
    }
  }

  const commit = await readGitCommit(source.root);
  const schemas = [];
  const fields = [];
  const definitions = [];
  const packagesById = new Map();
  const packageDocuments = [];
  const packageFields = [];

  for (const [absolutePath, loaded] of documents.entries())
  {
    const relativePath = toPosix(path.relative(source.root, absolutePath));
    if (!looksLikeJsonSchema(loaded.document, relativePath))
    {
      continue;
    }

    const document = loaded.document;
    const schemaRecord = {
      id: `${source.id}:${relativePath}`,
      sourceId: source.id,
      sourceLabel: source.label,
      relativePath,
      title: typeof document.title === "string" ? document.title : path.basename(relativePath, ".json"),
      description: typeof document.description === "string" ? document.description : null,
      schemaUri: typeof document.$schema === "string" ? document.$schema : null,
      schemaId: typeof document.$id === "string" ? document.$id : null,
      types: inferTypes(document),
      fileSha256: sha256(loaded.raw),
      fieldCount: 0,
      definitionCount: 0,
    };

    const schemaFields = collectFields(schemaRecord, document, absolutePath, documents);
    for (const definitionKey of ["$defs", "definitions"])
    {
      const definitionGroup = document[definitionKey];
      if (!isPlainObject(definitionGroup))
      {
        continue;
      }
      for (const [definitionName, definitionNode] of Object.entries(definitionGroup))
      {
        if (!isPlainObject(definitionNode))
        {
          continue;
        }
        const definitionPath = `${definitionKey}.${definitionName}`;
        const definitionPointer = `#/${pointerEscape(definitionKey)}/${pointerEscape(definitionName)}`;
        schemaFields.push(...collectFields(schemaRecord, document, absolutePath, documents, definitionNode, definitionPath, definitionPointer));
      }
    }
    const uniqueFields = [...new Map(schemaFields.map((field) => [`${field.path}::${field.pointer}`, field])).values()];
    const schemaDefinitions = collectDefinitions(schemaRecord, document);
    schemaRecord.fieldCount = uniqueFields.length;
    schemaRecord.definitionCount = schemaDefinitions.length;

    schemas.push(schemaRecord);
    fields.push(...uniqueFields.map((field) => ({ ...field, sourceId: source.id, sourceLabel: source.label, sourceRelativePath: relativePath })));
    definitions.push(...schemaDefinitions.map((definition) => ({ ...definition, schemaId: schemaRecord.id, sourceId: source.id, sourceLabel: source.label, sourceRelativePath: relativePath })));
  }

  for (const absolutePath of packageYamlPaths)
  {
    try
    {
      const raw = await readFile(absolutePath);
      const document = parseYaml(raw.toString("utf8"));
      const relativePath = toPosix(path.relative(source.root, absolutePath));
      const relativeRoot = toPosix(path.relative(source.root, path.dirname(absolutePath))) || ".";
      const packageId = `${source.id}:package:${relativeRoot}`;
      const documentId = `${packageId}:${path.basename(relativePath)}`;
      const documentRecord = {
        id: documentId,
        packageId,
        sourceId: source.id,
        sourceLabel: source.label,
        relativeRoot,
        relativePath,
        fileName: path.basename(relativePath),
        fileSha256: sha256(raw),
        topLevelKeys: isPlainObject(document) ? Object.keys(document).sort() : [],
        fieldCount: 0,
      };
      const documentFields = collectYamlFields(documentRecord, document);
      documentRecord.fieldCount = documentFields.length;
      packageDocuments.push(documentRecord);
      packageFields.push(...documentFields.map((field) => ({
        ...field,
        sourceId: source.id,
        sourceLabel: source.label,
        sourceRelativePath: relativePath,
      })));

      const packageRecord = packagesById.get(packageId) ?? {
        id: packageId,
        sourceId: source.id,
        sourceLabel: source.label,
        relativeRoot,
        label: packageLabel(relativeRoot),
        documentIds: [],
        fieldCount: 0,
      };
      packageRecord.documentIds.push(documentId);
      packageRecord.fieldCount += documentFields.length;
      packagesById.set(packageId, packageRecord);
    }
    catch (error)
    {
      const relativePath = toPosix(path.relative(source.root, absolutePath));
      console.warn(`  Warning: package YAML skipped (${relativePath}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const packages = [...packagesById.values()].map((record) => ({
    ...record,
    documentIds: [...record.documentIds].sort(),
    documentCount: record.documentIds.length,
  }));

  schemas.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  fields.sort((left, right) => left.schemaId.localeCompare(right.schemaId) || left.path.localeCompare(right.path));
  definitions.sort((left, right) => left.schemaId.localeCompare(right.schemaId) || left.name.localeCompare(right.name));
  packages.sort((left, right) => left.relativeRoot.localeCompare(right.relativeRoot));
  packageDocuments.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  packageFields.sort((left, right) => left.documentId.localeCompare(right.documentId) || left.path.localeCompare(right.path));

  return {
    source: {
      id: source.id,
      label: source.label,
      commit,
      schemaCount: schemas.length,
      fieldCount: fields.length,
      packageCount: packages.length,
      packageDocumentCount: packageDocuments.length,
      packageFieldCount: packageFields.length,
    },
    schemas,
    fields,
    definitions,
    packages,
    packageDocuments,
    packageFields,
  };
}

async function main()
{
  const sourceResults = [];
  for (const source of SOURCE_DEFINITIONS)
  {
    sourceResults.push(await loadSource(source));
  }

  const catalog = {
    schemaVersion: CATALOG_SCHEMA,
    generatedAt: new Date().toISOString(),
    sources: sourceResults.map((result) => result.source),
    schemas: sourceResults.flatMap((result) => result.schemas),
    fields: sourceResults.flatMap((result) => result.fields),
    definitions: sourceResults.flatMap((result) => result.definitions),
    packages: sourceResults.flatMap((result) => result.packages),
    packageDocuments: sourceResults.flatMap((result) => result.packageDocuments),
    packageFields: sourceResults.flatMap((result) => result.packageFields),
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

  const schemaCount = catalog.schemas.length;
  const fieldCount = catalog.fields.length;
  const packageCount = catalog.packages.length;
  const packageDocumentCount = catalog.packageDocuments.length;
  const packageFieldCount = catalog.packageFields.length;
  console.log(`Reference catalog generated: ${schemaCount} schema(s), ${fieldCount} schema field(s), ${packageCount} experiment package(s), ${packageDocumentCount} package YAML file(s), ${packageFieldCount} package field(s).`);
  for (const source of catalog.sources)
  {
    const commit = source.commit ? source.commit.slice(0, 12) : "unknown commit";
    console.log(`  ${source.label}: ${source.schemaCount} schema(s), ${source.fieldCount} schema field(s), ${source.packageCount} package(s), ${source.packageDocumentCount} package YAML file(s), ${source.packageFieldCount} package field(s), ${commit}`);
  }
  console.log(`  Output: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
}

main().catch((error) =>
{
  console.error(`Reference catalog generation failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
