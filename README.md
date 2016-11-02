# freeman-check
Simple type and format checking of JavaScript objects. This is a very popular utility at Freeman Industries.

# Installation
```
npm install freeman-check --save
```

# Usage
```
var Check = require('freeman-check')

var object = {
	name: "Nabil Freeman",
	favourite_films: [
		"Face/Off",
		"Bad Lieutenant",
		"The Wicker Man"
	]
}

var schema = {
	type: "object",
	properties: {
		name: {
			type: "string"
		}
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

Check.test(some_object, schema).then(function(object){
	console.log(object) //object === some_object
}).catch(function(error){
	console.log(error.message) // "`email` is missing." // "`email` is malformatted." // etc...
	console.log(error.schema) //error.schema === schema
})
```