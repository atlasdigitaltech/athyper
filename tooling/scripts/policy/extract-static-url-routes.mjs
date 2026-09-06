import ts from 'typescript';

// Interpret only static route-building expressions, never handlers or application code.
export function extractStaticUrlRoutes(source) {
  const file = ts.createSourceFile('routes.ts', source, ts.ScriptTarget.Latest, true);
  const functions = new Map();
  const routes = new Map();
  const attempted = new Map();
  const resolved = new Set();
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']);
  const receivers = new Set(['app', 'application', 'router']);
  const receiverTypes = new Set(['Application', 'Router', 'Express']);
  const constructors = new Set();
  for (const node of file.statements) {
    if (!ts.isImportDeclaration(node) || node.moduleSpecifier.text !== 'express') continue;
    if (node.importClause?.name) constructors.add(node.importClause.name.text);
    const bindings = node.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) for (const binding of bindings.elements) {
      const name = binding.propertyName?.text ?? binding.name.text;
      if (receiverTypes.has(name)) receiverTypes.add(binding.name.text);
      if (name === 'Router') constructors.add(binding.name.text);
    }
  }
  // Include typed parameters and aliases so renaming `app` cannot bypass policy.
  function collectReceivers(node) {
    if (ts.isParameter(node) && ts.isIdentifier(node.name) && node.type && [...receiverTypes].some((type) => new RegExp(`\\b${type}\\b`).test(node.type.getText(file)))) receivers.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isIdentifier(node.initializer) && receivers.has(node.initializer.text)) receivers.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const callee = node.initializer.expression;
      if ((ts.isIdentifier(callee) && constructors.has(callee.text)) || (ts.isPropertyAccessExpression(callee) && constructors.has(callee.expression.getText(file)) && callee.name.text === 'Router')) receivers.add(node.name.text);
    }
    ts.forEachChild(node, collectReceivers);
  }
  collectReceivers(file);
  for (const node of file.statements) if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
  function bind(parameters, args, env) {
    const local = new Map(env);
    parameters.forEach((p, i) => { if (ts.isIdentifier(p.name)) local.set(p.name.text, args[i]); });
    return local;
  }
  function value(node, env, depth = 0) {
    if (!node || depth > 12) return undefined;
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isRegularExpressionLiteral(node)) { const match = node.text.match(/^\/(.*)\/([a-z]*)$/); return match ? new RegExp(match[1], match[2]) : undefined; }
    if (ts.isIdentifier(node)) return env.get(node.text);
    if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)) return value(node.expression, env, depth + 1);
    if (ts.isArrayLiteralExpression(node)) return node.elements.map((n) => value(n, env, depth + 1));
    if (ts.isObjectLiteralExpression(node)) return Object.fromEntries(node.properties.filter(ts.isPropertyAssignment).map((p) => [p.name.getText(file).replace(/['"]/g, ''), value(p.initializer, env, depth + 1)]));
    if (ts.isPropertyAccessExpression(node)) return value(node.expression, env, depth + 1)?.[node.name.text];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken) {
      const left = value(node.left, env, depth + 1), right = value(node.right, env, depth + 1);
      return left === undefined || right === undefined ? undefined : left === right;
    }
    if (ts.isConditionalExpression(node)) {
      const condition = value(node.condition, env, depth + 1);
      return typeof condition === 'boolean' ? value(condition ? node.whenTrue : node.whenFalse, env, depth + 1) : undefined;
    }
    if (ts.isArrowFunction(node)) return { arrow: node, env: new Map(env) };
    if (ts.isTemplateExpression(node)) {
      let text = node.head.text;
      for (const span of node.templateSpans) { const part = value(span.expression, env, depth + 1); if (typeof part !== 'string') return undefined; text += part + span.literal.text; }
      return text;
    }
    if (ts.isCallExpression(node)) {
      if (ts.isPropertyAccessExpression(node.expression) && ['replace', 'replaceAll'].includes(node.expression.name.text)) {
        const receiver = value(node.expression.expression, env, depth + 1);
        const args = node.arguments.map((n) => value(n, env, depth + 1));
        if (typeof receiver === 'string' && (typeof args[0] === 'string' || args[0] instanceof RegExp) && typeof args[1] === 'string') return receiver[node.expression.name.text](...args);
      }
      const fn = value(node.expression, env, depth + 1);
      if (fn?.arrow && !ts.isBlock(fn.arrow.body)) return value(fn.arrow.body, bind(fn.arrow.parameters, node.arguments.map((n) => value(n, env, depth + 1)), fn.env), depth + 1);
    }
    return undefined;
  }
  function emit(node, method, paths, kind) {
    attempted.set(node.pos, node);
    if (!methods.has(method)) return;
    for (const path of Array.isArray(paths) ? paths : [paths]) {
      if (typeof path !== 'string' || !path.startsWith('/')) continue;
      resolved.add(node.pos);
      routes.set(`${method} ${path}`, { method: method.toUpperCase(), declaredPath: path, kind, line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
    }
  }
  function visit(node, env, stack = []) {
    if (!node || stack.length > 12) return;
    if (ts.isFunctionDeclaration(node)) return;
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) { visit(node.body, new Map(env), stack); return; }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) { env.set(node.name.text, value(node.initializer, env)); }
    if (ts.isObjectLiteralExpression(node)) {
      const descriptor = value(node, env);
      if (descriptor?.kind === 'route' && descriptor.method && descriptor.path) emit(node, descriptor.method, descriptor.path, 'contract');
    }
    if (ts.isForOfStatement(node)) {
      const rows = value(node.expression, env);
      if (Array.isArray(rows)) {
        const name = node.initializer.declarations?.[0]?.name;
        for (const row of rows) {
          const local = new Map(env);
          if (name && ts.isIdentifier(name)) local.set(name.text, row);
          else if (name && ts.isArrayBindingPattern(name)) name.elements.forEach((element, i) => local.set(element.name?.getText(file), row?.[i]));
          visit(node.statement, local, stack);
        }
        return;
      }
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      if (ts.isElementAccessExpression(expression) && receivers.has(expression.expression.getText(file))) {
        attempted.set(node.pos, node); return;
      }
      if (ts.isPropertyAccessExpression(expression) && receivers.has(expression.expression.getText(file)) && ['route', 'all', 'use'].includes(expression.name.text)) {
        attempted.set(node.pos, node); return;
      }
      if (ts.isPropertyAccessExpression(expression) && receivers.has(expression.expression.getText(file)) && methods.has(expression.name.text)) {
        emit(node, expression.name.text, value(node.arguments[0], env), 'direct');
        return; // Do not inspect request handler bodies.
      }
      if (ts.isIdentifier(expression)) {
        const name = expression.text;
        if (name === 'defineRouteContract') {
          const properties = node.arguments[0]?.properties ?? [];
          const property = (key) => properties.find((p) => p.name?.getText(file) === key);
          const read = (key) => { const p = property(key); return p && ts.isShorthandPropertyAssignment(p) ? env.get(key) : value(p?.initializer, env); };
          emit(node, read('method'), read('path'), 'contract');
          return;
        }
        const fn = functions.get(name);
        if (fn && !stack.includes(name)) {
          visit(fn.body, bind(fn.parameters, node.arguments.map((n) => value(n, env)), env), [...stack, name]);
          return;
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, env, stack));
  }
  const env = new Map();
  for (const node of file.statements) visit(node, env);
  for (const [name, fn] of functions) visit(fn.body, new Map(env), [name]);
  return { routes: [...routes.values()], unresolved: [...attempted].filter(([pos]) => !resolved.has(pos)).map(([, node]) => ({ line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1, expression: node.getText(file).slice(0, 160) })) };
}
