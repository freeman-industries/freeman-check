# freeman-check
Simple type and format checking of JavaScript objects. This is a very popular utility at Freeman Industries.

# Installation
```
npm install freeman-check --save
```

# Usage

You can use `freeman-check` to validate JavaScript objects against a specified JSON schema.

In this example, the Check class is used to validate an object against a defined schema. If the object doesn't conform to the schema, a CheckError is thrown with details about the validation failure.

### TypeScript example

```typescript
import { Check, Schema, CheckError } from 'freeman-check';

const object = {
	name: "Nabil Freeman",
	email: "nabil@freeman.sh",
	favourite_films: [
		"Face/Off",
		"Bad Lieutenant",
		"The Wicker Man"
	]
};

const schema: Schema = {
	type: "object",
	properties: {
		name: {
			type: "string"
		},
		email: {
			type: "string",
			format: "email"
		},
		favourite_films: {
			type: "array",
			items: {
				type: "string"
			}
		}
	},
	required: ["name", "email", "favourite_films"]
};

const check = new Check(schema);

try {
	check.test(object);
	console.log("Object is valid!");
} catch (error: unknown) {
	if (error instanceof CheckError) {
		console.log(error.message);
		console.log(error.schema);
	}

	throw error;
}
```

### JavaScript example

```javascript
const { Check, CheckError } = require('freeman-check');

const object = {
	name: "Nabil Freeman",
	email: "nabil@freeman.sh",
	favourite_films: [
		"Face/Off",
		"Bad Lieutenant",
		"The Wicker Man"
	]
};

const schema = {
	type: "object",
	properties: {
		name: {
			type: "string"
		},
		email: {
			type: "string",
			format: "email"
		},
		favourite_films: {
			type: "array",
			items: {
				type: "string"
			}
		}
	},
	required: ["name", "email", "favourite_films"]
};

const check = new Check(schema);

try {
	check.test(object);
	console.log("Object is valid!");
} catch (error) {
	if (error instanceof CheckError) {
		console.log(error.message);
		console.log(error.schema);
	}

	throw error;
}
```

# The `Schema` type

This type is directly exported from the `jsonschema` package for your convenience.

This is the library that the `Check` class uses to validate objects.

You can find more information about this library here:

https://www.npmjs.com/package/jsonschema

### Compatibility with Schema types from other libraries

There are small inconsistencies between JSON Schema types from different libraries, because the standard is so flexible.

Depending on reported use cases it might be necessary to add support for a custom schema type.

If you think this applies to you, feel free to open an issue.
