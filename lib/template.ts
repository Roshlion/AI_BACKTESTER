/**
 * Safe template renderer for ML hyperparameter substitution
 * Replaces {{key}} tokens with values from hyperparams object
 * No eval - just simple string replacement
 */

export function renderTemplate(
  template: string,
  hyperparams: Record<string, any>
): string {
  let rendered = template;

  // Replace all {{key}} tokens with their corresponding hyperparam values
  Object.keys(hyperparams).forEach((key) => {
    const value = hyperparams[key];
    const token = `{{${key}}}`;
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');

    // Convert value to string representation
    const stringValue = typeof value === 'string'
      ? `"${value}"`
      : String(value);

    rendered = rendered.replace(regex, stringValue);
  });

  return rendered;
}

/**
 * Extract all template tokens from a template string
 * Returns array of token names (without the {{ }})
 */
export function extractTokens(template: string): string[] {
  const tokenRegex = /\{\{([^}]+)\}\}/g;
  const tokens: string[] = [];
  let match;

  while ((match = tokenRegex.exec(template)) !== null) {
    if (match[1] && !tokens.includes(match[1])) {
      tokens.push(match[1]);
    }
  }

  return tokens;
}

/**
 * Validate that hyperparams match uiSchema constraints
 * Returns array of validation errors (empty if valid)
 */
export function validateHyperparams(
  hyperparams: Record<string, any>,
  uiSchema: Record<string, any>
): string[] {
  const errors: string[] = [];

  Object.keys(uiSchema).forEach((key) => {
    const schema = uiSchema[key];
    const value = hyperparams[key];

    if (value === undefined || value === null) {
      errors.push(`${key} is required`);
      return;
    }

    if (schema.type === 'number') {
      const numValue = Number(value);

      if (isNaN(numValue)) {
        errors.push(`${key} must be a number`);
        return;
      }

      if (schema.min !== undefined && numValue < schema.min) {
        errors.push(`${key} must be at least ${schema.min}`);
      }

      if (schema.max !== undefined && numValue > schema.max) {
        errors.push(`${key} must be at most ${schema.max}`);
      }

      if (schema.step !== undefined) {
        const remainder = (numValue - (schema.min || 0)) % schema.step;
        if (Math.abs(remainder) > 0.0001) {
          errors.push(`${key} must be a multiple of ${schema.step}`);
        }
      }
    }

    if (schema.type === 'select' && schema.options) {
      if (!schema.options.includes(value)) {
        errors.push(`${key} must be one of: ${schema.options.join(', ')}`);
      }
    }
  });

  return errors;
}

/**
 * Clamp a numeric value to min/max from schema
 */
export function clampValue(
  value: number,
  schema: { min?: number; max?: number; step?: number }
): number {
  let clamped = value;

  if (schema.min !== undefined && clamped < schema.min) {
    clamped = schema.min;
  }

  if (schema.max !== undefined && clamped > schema.max) {
    clamped = schema.max;
  }

  // Round to nearest step
  if (schema.step !== undefined && schema.min !== undefined) {
    const steps = Math.round((clamped - schema.min) / schema.step);
    clamped = schema.min + steps * schema.step;
  }

  return clamped;
}
