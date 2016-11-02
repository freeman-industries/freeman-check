//freeman-check
//usage:
/*
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
*/

var Promise = require('bluebird');
var Validate = require('jsonschema').validate;
var anora = require('anora');

//override error object so we can have whatever we want in the message field.
var CheckError = function(message){
	this.message = message
}
CheckError.prototype = new Error();

var main = {
	test: function(object, schema){
		return new Promise(function(resolve, reject){
			if(object === null || object === undefined){
				reject(new CheckError('The first argument is null or undefined.'))
			}

			if(schema === null || schema === undefined){
				reject(new CheckError('The second argument is null or undefined.'))
			}

			//validate.
			var result = Validate(object, schema);

			//if there are no errors, the object is valid.
			if(result.errors.length === 0){
				resolve(object);
				return;
			}

			//init error string
			var error_message = "";

			result.errors.forEach(function(error){
				var subject = error.argument; //name, email, etc.
				var problem = "is incorrect"; //default

				//assign plain english to error messages.
				switch(error.name){
					case "additionalProperties":
						problem = "is not allowed";
					break;
					case "required":
						problem = "is missing";
					break;
					case "format":
						problem = "is malformatted";
					break;
					case "type":
						subject = error.property.replace("instance.", "");
						problem = 'needs to be ' + anora(error.schema.type) +  ' `' + error.schema.type + '`'
					break;
				}

				//concatenate all validation errors.
				error_message += ('`' + subject + '` ' + problem + '. ');
			});

			//remove last character from concatenated error message.
			error_message = error_message.slice(0, -1);

			var error = new CheckError(error_message);

			error.schema = schema;

			reject(error);
		})
	},

	Error: CheckError
};

module.exports = main;