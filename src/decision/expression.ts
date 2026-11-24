export type DecisionVariables = Record<"goal" | "obligation" | "boundary" | "procedure" | "fidelity" | "recovery", number>;
export type DecisionParameters = Record<string, number>;

type TokenKind = "number" | "identifier" | "operator" | "left-paren" | "right-paren" | "comma" | "eof";

interface Token
{
  kind: TokenKind;
  text: string;
  value?: number;
}

const variableNames = new Set(["goal", "obligation", "boundary", "procedure", "fidelity", "recovery"]);
const functionNames = new Set(["abs", "sqrt", "exp", "log", "log10", "sin", "cos", "tan", "min", "max", "pow", "clamp"]);
const constants: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

export function isValidParameterId(value: string): boolean
{
  const normalized = value.toLowerCase();
  return /^[a-z_][a-z0-9_]*$/.test(normalized)
    && !variableNames.has(normalized)
    && !functionNames.has(normalized)
    && !Object.prototype.hasOwnProperty.call(constants, normalized);
}

function tokenize(expression: string): Token[]
{
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length)
  {
    const character = expression[index];
    if (/\s/.test(character))
    {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(character))
    {
      const start = index;
      let dots = 0;
      while (index < expression.length && /[0-9.eE+-]/.test(expression[index]))
      {
        const current = expression[index];
        if (current === ".")
        {
          dots += 1;
        }
        if ((current === "+" || current === "-") && index > start)
        {
          const previous = expression[index - 1];
          if (previous !== "e" && previous !== "E")
          {
            break;
          }
        }
        index += 1;
      }

      const text = expression.slice(start, index);
      if (dots > 1 || !/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text))
      {
        throw new Error(`Invalid number '${text}'.`);
      }
      const value = Number(text);
      if (!Number.isFinite(value))
      {
        throw new Error(`Number '${text}' is not finite.`);
      }
      tokens.push({ kind: "number", text, value });
      continue;
    }

    if (/[A-Za-z_]/.test(character))
    {
      const start = index;
      index += 1;
      while (index < expression.length && /[A-Za-z0-9_]/.test(expression[index]))
      {
        index += 1;
      }
      tokens.push({ kind: "identifier", text: expression.slice(start, index).toLowerCase() });
      continue;
    }

    if ("+-*/^".includes(character))
    {
      tokens.push({ kind: "operator", text: character });
      index += 1;
      continue;
    }
    if (character === "(")
    {
      tokens.push({ kind: "left-paren", text: character });
      index += 1;
      continue;
    }
    if (character === ")")
    {
      tokens.push({ kind: "right-paren", text: character });
      index += 1;
      continue;
    }
    if (character === ",")
    {
      tokens.push({ kind: "comma", text: character });
      index += 1;
      continue;
    }

    throw new Error(`Unsupported character '${character}'.`);
  }

  tokens.push({ kind: "eof", text: "" });
  return tokens;
}

function callFunction(name: string, args: number[]): number
{
  const requireArgs = (count: number): void =>
  {
    if (args.length !== count)
    {
      throw new Error(`${name} expects ${count} argument${count === 1 ? "" : "s"}.`);
    }
  };

  let result: number;
  switch (name)
  {
    case "abs":
      requireArgs(1);
      result = Math.abs(args[0]);
      break;
    case "sqrt":
      requireArgs(1);
      result = Math.sqrt(args[0]);
      break;
    case "exp":
      requireArgs(1);
      result = Math.exp(args[0]);
      break;
    case "log":
      requireArgs(1);
      result = Math.log(args[0]);
      break;
    case "log10":
      requireArgs(1);
      result = Math.log10(args[0]);
      break;
    case "sin":
      requireArgs(1);
      result = Math.sin(args[0]);
      break;
    case "cos":
      requireArgs(1);
      result = Math.cos(args[0]);
      break;
    case "tan":
      requireArgs(1);
      result = Math.tan(args[0]);
      break;
    case "pow":
      requireArgs(2);
      result = Math.pow(args[0], args[1]);
      break;
    case "clamp":
      requireArgs(3);
      result = Math.min(Math.max(args[0], args[1]), args[2]);
      break;
    case "min":
      if (args.length === 0)
      {
        throw new Error("min expects at least one argument.");
      }
      result = Math.min(...args);
      break;
    case "max":
      if (args.length === 0)
      {
        throw new Error("max expects at least one argument.");
      }
      result = Math.max(...args);
      break;
    default:
      throw new Error(`Unknown function '${name}'.`);
  }

  if (!Number.isFinite(result))
  {
    throw new Error(`${name} produced a non-finite result.`);
  }
  return result;
}

class Parser
{
  private index = 0;

  public constructor(
    private readonly tokens: Token[],
    private readonly variables: DecisionVariables,
    private readonly parameters: DecisionParameters,
  )
  {
  }

  public parse(): number
  {
    const value = this.parseExpression();
    if (this.current().kind !== "eof")
    {
      throw new Error(`Unexpected token '${this.current().text}'.`);
    }
    if (!Number.isFinite(value))
    {
      throw new Error("Expression produced a non-finite result.");
    }
    return value;
  }

  private current(): Token
  {
    return this.tokens[this.index];
  }

  private consume(): Token
  {
    const token = this.current();
    this.index += 1;
    return token;
  }

  private parseExpression(): number
  {
    let value = this.parseTerm();
    while (this.current().kind === "operator" && (this.current().text === "+" || this.current().text === "-"))
    {
      const operator = this.consume().text;
      const right = this.parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  private parseTerm(): number
  {
    let value = this.parsePower();
    while (this.current().kind === "operator" && (this.current().text === "*" || this.current().text === "/"))
    {
      const operator = this.consume().text;
      const right = this.parsePower();
      value = operator === "*" ? value * right : value / right;
      if (!Number.isFinite(value))
      {
        throw new Error("Division produced a non-finite result.");
      }
    }
    return value;
  }

  private parsePower(): number
  {
    let value = this.parseUnary();
    if (this.current().kind === "operator" && this.current().text === "^")
    {
      this.consume();
      value = Math.pow(value, this.parsePower());
    }
    return value;
  }

  private parseUnary(): number
  {
    if (this.current().kind === "operator" && (this.current().text === "+" || this.current().text === "-"))
    {
      const operator = this.consume().text;
      const value = this.parseUnary();
      return operator === "-" ? -value : value;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): number
  {
    const token = this.current();
    if (token.kind === "number")
    {
      this.consume();
      return token.value ?? 0;
    }

    if (token.kind === "identifier")
    {
      const name = this.consume().text;
      if (this.current().kind === "left-paren")
      {
        this.consume();
        const args: number[] = [];
        if (this.current().kind !== "right-paren")
        {
          while (true)
          {
            args.push(this.parseExpression());
            if (this.current().kind !== "comma")
            {
              break;
            }
            this.consume();
          }
        }
        if (this.current().kind !== "right-paren")
        {
          throw new Error(`Expected ')' after ${name}.`);
        }
        this.consume();
        return callFunction(name, args);
      }

      if (variableNames.has(name))
      {
        return this.variables[name as keyof DecisionVariables];
      }
      if (Object.prototype.hasOwnProperty.call(this.parameters, name))
      {
        return this.parameters[name];
      }
      if (Object.prototype.hasOwnProperty.call(constants, name))
      {
        return constants[name];
      }
      throw new Error(`Unknown variable or parameter '${name}'.`);
    }

    if (token.kind === "left-paren")
    {
      this.consume();
      const value = this.parseExpression();
      if (this.current().kind !== "right-paren")
      {
        throw new Error("Expected ')'.");
      }
      this.consume();
      return value;
    }

    throw new Error(`Unexpected token '${token.text || "end of expression"}'.`);
  }
}

export function evaluateDecisionExpression(
  expression: string,
  variables: DecisionVariables,
  parameters: DecisionParameters = {},
): number
{
  if (expression.trim().length === 0)
  {
    throw new Error("Expression is empty.");
  }
  return new Parser(tokenize(expression), variables, parameters).parse();
}

export function validateDecisionExpression(
  expression: string,
  parameters: DecisionParameters = {},
): string | null
{
  try
  {
    evaluateDecisionExpression(expression, {
      goal: 0.5,
      obligation: 0.5,
      boundary: 0.5,
      procedure: 0.5,
      fidelity: 0.5,
      recovery: 0.5,
    }, parameters);
    return null;
  }
  catch (error)
  {
    return error instanceof Error ? error.message : "Invalid expression.";
  }
}
