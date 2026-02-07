import type { VariableDictionary } from '../types/grid';

// Token types for the expression parser
type TokenType =
  | 'NUMBER'
  | 'IDENTIFIER'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'LBRACKET'
  | 'RBRACKET'
  | 'COMMA'
  | 'EOF';

interface Token {
  type: TokenType;
  value: string;
}

// Tokenize the expression string
function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let pos = 0;

  while (pos < expression.length) {
    const char = expression[pos];

    // Skip whitespace
    if (/\s/.test(char)) {
      pos++;
      continue;
    }

    // Numbers (including decimals)
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(expression[pos + 1]))) {
      let numStr = '';
      while (pos < expression.length && /[0-9.]/.test(expression[pos])) {
        numStr += expression[pos];
        pos++;
      }
      tokens.push({ type: 'NUMBER', value: numStr });
      continue;
    }

    // Identifiers (variable names and function names)
    if (/[a-zA-Z_]/.test(char)) {
      let idStr = '';
      while (pos < expression.length && /[a-zA-Z0-9_]/.test(expression[pos])) {
        idStr += expression[pos];
        pos++;
      }
      tokens.push({ type: 'IDENTIFIER', value: idStr });
      continue;
    }

    // Operators
    if (['+', '-', '*', '/', '^', '%'].includes(char)) {
      if (char === '/' && expression[pos + 1] === '/') {
        tokens.push({ type: 'OPERATOR', value: '//' });
        pos += 2;
      } else {
        tokens.push({ type: 'OPERATOR', value: char });
        pos++;
      }
      continue;
    }

    // Parentheses and brackets
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: char });
      pos++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: char });
      pos++;
      continue;
    }
    if (char === '[') {
      tokens.push({ type: 'LBRACKET', value: char });
      pos++;
      continue;
    }
    if (char === ']') {
      tokens.push({ type: 'RBRACKET', value: char });
      pos++;
      continue;
    }
    if (char === ',') {
      tokens.push({ type: 'COMMA', value: char });
      pos++;
      continue;
    }

    // Unknown character - skip
    pos++;
  }

  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// AST Node types
type ASTNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'arrayAccess'; array: string; index: ASTNode }
  | { type: 'binaryOp'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'unaryOp'; operator: string; operand: ASTNode }
  | { type: 'functionCall'; name: string; args: ASTNode[] };

// Parser class
class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos];
  }

  private consume(expectedType?: TokenType): Token {
    const token = this.current();
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Expected ${expectedType} but got ${token.type}`);
    }
    this.pos++;
    return token;
  }

  // Parse expression with operator precedence
  parse(): ASTNode {
    return this.parseAddSub();
  }

  // Addition and subtraction (lowest precedence)
  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv();

    while (this.current().type === 'OPERATOR' &&
           ['+', '-'].includes(this.current().value)) {
      const op = this.consume().value;
      const right = this.parseMulDiv();
      left = { type: 'binaryOp', operator: op, left, right };
    }

    return left;
  }

  // Multiplication, division, modulo
  private parseMulDiv(): ASTNode {
    let left = this.parsePower();

    while (this.current().type === 'OPERATOR' &&
           ['*', '/', '//', '%'].includes(this.current().value)) {
      const op = this.consume().value;
      const right = this.parsePower();
      left = { type: 'binaryOp', operator: op, left, right };
    }

    return left;
  }

  // Power (right associative, highest binary precedence)
  private parsePower(): ASTNode {
    const left = this.parseUnary();

    if (this.current().type === 'OPERATOR' && this.current().value === '^') {
      this.consume();
      const right = this.parsePower(); // Right associative
      return { type: 'binaryOp', operator: '^', left, right };
    }

    return left;
  }

  // Unary operators (-, +)
  private parseUnary(): ASTNode {
    if (this.current().type === 'OPERATOR' &&
        ['-', '+'].includes(this.current().value)) {
      const op = this.consume().value;
      const operand = this.parseUnary();
      if (op === '-') {
        return { type: 'unaryOp', operator: '-', operand };
      }
      return operand; // Unary + is a no-op
    }

    return this.parsePrimary();
  }

  // Primary expressions: numbers, variables, function calls, array access, parentheses
  private parsePrimary(): ASTNode {
    const token = this.current();

    // Number
    if (token.type === 'NUMBER') {
      this.consume();
      return { type: 'number', value: parseFloat(token.value) };
    }

    // Parentheses
    if (token.type === 'LPAREN') {
      this.consume(); // (
      const expr = this.parse();
      this.consume('RPAREN'); // )
      return expr;
    }

    // Identifier: could be variable, function call, or array access
    if (token.type === 'IDENTIFIER') {
      const name = this.consume().value;

      // Function call: name(args)
      if (this.current().type === 'LPAREN') {
        this.consume(); // (
        const args: ASTNode[] = [];

        if (this.current().type !== 'RPAREN') {
          args.push(this.parse());
          while (this.current().type === 'COMMA') {
            this.consume(); // ,
            args.push(this.parse());
          }
        }

        this.consume('RPAREN'); // )
        return { type: 'functionCall', name, args };
      }

      // Array access: name[index]
      if (this.current().type === 'LBRACKET') {
        this.consume(); // [
        const index = this.parse();
        this.consume('RBRACKET'); // ]
        return { type: 'arrayAccess', array: name, index };
      }

      // Simple variable
      return { type: 'variable', name };
    }

    throw new Error(`Unexpected token: ${token.type} (${token.value})`);
  }
}

// Evaluate the AST
function evaluateAST(node: ASTNode, variables: VariableDictionary): number {
  switch (node.type) {
    case 'number':
      return node.value;

    case 'variable': {
      const varData = variables[node.name];
      if (!varData) {
        throw new Error(`Variable "${node.name}" not found`);
      }
      if (varData.type !== 'int' && varData.type !== 'float') {
        throw new Error(`Variable "${node.name}" is not a number`);
      }
      return varData.value;
    }

    case 'arrayAccess': {
      const arrData = variables[node.array];
      if (!arrData) {
        throw new Error(`Array "${node.array}" not found`);
      }
      if (arrData.type !== 'arr[int]') {
        throw new Error(`"${node.array}" is not an array`);
      }
      const index = Math.floor(evaluateAST(node.index, variables));
      if (index < 0 || index >= arrData.value.length) {
        throw new Error(`Array index ${index} out of bounds for "${node.array}"`);
      }
      return arrData.value[index];
    }

    case 'binaryOp': {
      const left = evaluateAST(node.left, variables);
      const right = evaluateAST(node.right, variables);

      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/':
          if (right === 0) throw new Error('Division by zero');
          return left / right;
        case '//':
          if (right === 0) throw new Error('Division by zero');
          return Math.floor(left / right);
        case '^': return Math.pow(left, right);
        case '%':
          if (right === 0) throw new Error('Modulo by zero');
          return left % right;
        default:
          throw new Error(`Unknown operator: ${node.operator}`);
      }
    }

    case 'unaryOp': {
      const operand = evaluateAST(node.operand, variables);
      if (node.operator === '-') {
        return -operand;
      }
      return operand;
    }

    case 'functionCall': {
      const args = node.args.map(arg => evaluateAST(arg, variables));
      const funcName = node.name.toLowerCase();

      switch (funcName) {
        case 'abs':
          if (args.length !== 1) throw new Error('abs() requires exactly 1 argument');
          return Math.abs(args[0]);
        case 'floor':
          if (args.length !== 1) throw new Error('floor() requires exactly 1 argument');
          return Math.floor(args[0]);
        case 'ceil':
          if (args.length !== 1) throw new Error('ceil() requires exactly 1 argument');
          return Math.ceil(args[0]);
        case 'round':
          if (args.length !== 1) throw new Error('round() requires exactly 1 argument');
          return Math.round(args[0]);
        case 'min':
          if (args.length < 2) throw new Error('min() requires at least 2 arguments');
          return Math.min(...args);
        case 'max':
          if (args.length < 2) throw new Error('max() requires at least 2 arguments');
          return Math.max(...args);
        default:
          throw new Error(`Unknown function: ${node.name}`);
      }
    }

    default:
      throw new Error('Unknown AST node type');
  }
}

/**
 * Evaluate a mathematical expression with variable substitution
 *
 * Supported operations:
 * - Arithmetic: +, -, *, /, //, ^ (power), % (modulo)
 * - Functions: abs(), floor(), ceil(), round(), min(), max()
 * - Variables: any int variable from the dictionary
 * - Array access: arr[i], arr[0], arr[i+1]
 *
 * Examples:
 * - "i + 1"
 * - "arr[j]"
 * - "floor(i / 2)"
 * - "abs(i - 5)"
 * - "arr[i] + arr[j]"
 * - "i ^ 2"
 *
 * @param expression The expression string to evaluate
 * @param variables The variable dictionary containing current values
 * @returns The evaluated result as a number
 * @throws Error if the expression is invalid or variables are missing
 */
export function evaluateExpression(expression: string, variables: VariableDictionary): number {
  if (!expression.trim()) {
    throw new Error('Empty expression');
  }

  try {
    const tokens = tokenize(expression);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return evaluateAST(ast, variables);
  } catch (error) {
    throw new Error(`Expression error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate an expression without evaluating it
 * Returns null if valid, or an error message if invalid
 */
export function validateExpression(expression: string, variables: VariableDictionary): string | null {
  try {
    evaluateExpression(expression, variables);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid expression';
  }
}

/**
 * Get a list of variables used in an expression
 */
export function getExpressionVariables(expression: string): string[] {
  const tokens = tokenize(expression);
  const vars: string[] = [];
  const functions = ['abs', 'floor', 'ceil', 'round', 'min', 'max'];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === 'IDENTIFIER' && !functions.includes(token.value.toLowerCase())) {
      if (!vars.includes(token.value)) {
        vars.push(token.value);
      }
    }
  }

  return vars;
}
