import ast
import json

def analyze_variables(code_str):
    try:
        tree = ast.parse(code_str)
    except SyntaxError:
        return []

    variables = []
    seen = set()

    class ScopeVisitor(ast.NodeVisitor):
        def __init__(self):
            self.scope_stack = []

        def current_scope(self):
            return self.scope_stack[-1] if self.scope_stack else 'global'

        def visit_FunctionDef(self, node):
            self.scope_stack.append(node.name)
            self.generic_visit(node)
            self.scope_stack.pop()

        def visit_AsyncFunctionDef(self, node):
            self.scope_stack.append(node.name)
            self.generic_visit(node)
            self.scope_stack.pop()

        def visit_Name(self, node):
            if isinstance(node.ctx, ast.Store) and not node.id.startswith('_'):
                scope = self.current_scope()
                key = (node.id, scope)
                if key not in seen:
                    variables.append({
                        'name': node.id,
                        'type': 'unknown',
                        'scope': scope
                    })
                    seen.add(key)

    ScopeVisitor().visit(tree)
    return variables
