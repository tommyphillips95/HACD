// A small JSON Schema (2020-12) checker, enough for the keywords contracts/ uses.
// Zero dependencies on purpose. It throws on a keyword it does not know, so a
// contract can never quietly outgrow what the tests actually check.
"use strict";

const KNOWN = new Set([
  "$schema", "$id", "title", "description", "type", "required", "properties",
  "additionalProperties", "enum", "items", "minItems", "uniqueItems", "minLength",
  "pattern", "minimum", "maximum", "format", "allOf", "if", "then", "$defs", "$ref"
]);

const FORMATS = {
  "date-time": /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/,
  date: /^\d{4}-\d{2}-\d{2}$/
};

function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

function typeOk(v, t) {
  const actual = typeOf(v);
  return actual === t || (t === "number" && actual === "integer");
}

function validate(schema, value, root = schema, at = "$") {
  const errors = [];
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`schema-lite: unsupported keyword ${k} at ${at}`);
  if (schema.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    if (!m) throw new Error(`schema-lite: unsupported $ref ${schema.$ref}`);
    return validate(root.$defs[m[1]], value, root, at);
  }
  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => typeOk(value, t))) return [`${at}: expected ${types.join("|")}, got ${typeOf(value)}`];
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errors.push(`${at}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
    if (schema.format) {
      if (!FORMATS[schema.format]) throw new Error(`schema-lite: unsupported format ${schema.format}`);
      if (!FORMATS[schema.format].test(value) || isNaN(Date.parse(value))) errors.push(`${at}: not a ${schema.format}`);
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${at}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${at}: items not unique`);
    if (schema.items) value.forEach((v, i) => errors.push(...validate(schema.items, v, root, `${at}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const r of schema.required || []) if (!(r in value)) errors.push(`${at}: missing ${r}`);
    const props = schema.properties || {};
    for (const [k, v] of Object.entries(value)) {
      if (props[k]) errors.push(...validate(props[k], v, root, `${at}.${k}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected ${k}`);
    }
  }
  for (const sub of schema.allOf || []) errors.push(...validate(sub, value, root, at));
  if (schema.if) {
    const ifSchema = Object.assign({}, schema.if);
    if (validate(ifSchema, value, root, at).length === 0 && schema.then) errors.push(...validate(schema.then, value, root, at));
  }
  return errors;
}

module.exports = { validate };
