import ts from 'typescript';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname, relative, sep } from 'node:path';

const roots = ['apps/api/src', 'apps/web/src'].map((path) => resolve(path));
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory()
      ? filesIn(path)
      : /\.(ts|tsx)$/.test(path) && !path.endsWith('.d.ts')
        ? [path]
        : [];
  });
}
function targetFile(importer, specifier, known) {
  if (!specifier.startsWith('.')) return undefined;
  const base = resolve(dirname(importer), specifier.replace(/\.js$/, ''));
  return [base + '.ts', base + '.tsx', resolve(base, 'index.ts'), resolve(base, 'index.tsx')].find(
    (candidate) => known.has(candidate) && existsSync(candidate),
  );
}
let failures = 0;
for (const root of roots) {
  const files = filesIn(root),
    known = new Set(files),
    edges = new Map();
  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      extname(file) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const imports = [];
    function visit(node) {
      let module;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        module = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      )
        module = node.arguments[0].text;
      if (module) {
        const found = targetFile(file, module, known);
        if (found) imports.push(found);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
    edges.set(file, imports);
  }
  const complete = new Set(),
    active = new Set(),
    stack = [];
  function visit(file) {
    if (active.has(file)) {
      failures++;
      console.error(
        'Ciclo:',
        [...stack.slice(stack.indexOf(file)), file]
          .map((f) => relative(root, f).split(sep).join('/'))
          .join(' -> '),
      );
      return;
    }
    if (complete.has(file)) return;
    active.add(file);
    stack.push(file);
    for (const dependency of edges.get(file)) visit(dependency);
    stack.pop();
    active.delete(file);
    complete.add(file);
  }
  for (const file of files) visit(file);
  console.log(`${relative(process.cwd(), root)}: ${files.length} archivos revisados`);
}
if (failures) process.exitCode = 1;
else console.log('Sin ciclos entre importaciones relativas estáticas o dinámicas literales.');
