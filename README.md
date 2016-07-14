# freeman-check
Simple type and format checking of JavaScript objects. This is a very popular utility at Freeman Industries.

# Installation
```
npm install freeman-check --save
```

# Usage
```
var Check = require('freeman-check')

var user = {
	name: "Nabil Freeman",
	favourite_films: ["Face/Off", "Bad Lieutenant", "The Wicker Man"]
}

var check = Check(user, {
	name: "string",
	favourite_films: "array",
	profile: {
		email: "string",
		sign_in_count: "number"
	}
})

if(check instanceof Check.Error){
	console.log(check.message);
}
```

The above will throw a `not found` error as `profile` is missing.
