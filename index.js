//freeman-env
//usage:
/*
var Check = require('freeman-check')

var some_object = {
	name: "Nabil Freeman",
	favourite_films: "Face/Off, Bad Lieutenant, The Wicker Man",

}

var check = Check(some_object, {
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

The above will throw a `not found` error as `profile` is missing.
*/

//override error object so we can have whatever we want in the message field.
var CheckError = function(message){
	this.message = message
}

CheckError.prototype = new Error();

var joinOptionalParameters = function(item, required_format, optional_root_object){
	if(optional_root_object === undefined){
		return required_format;
	}

	var item_keys = Object.keys(item);
	var required_keys = Object.keys(required_format);
	var optional_keys = Object.keys(optional_root_object);

	//check if there are more keys in the root object than the desired format.
	//if there are, this means that there might be an optional parameter passed.
	if(item_keys.length <= required_keys.length){
		return required_format; //there are not more keys.
	}

	//there are more keys in the item than the required format...
	//so let's join the optional object onto the map we are testing against.
	optional_keys.forEach(function(key){
		required_format[key] = optional_root_object[key];
	})

	return required_format;
};

var type = function(element, already_defined){
	var type_string;

	if(element instanceof Array){
		type_string = "array";
	} else if(element === null){
		type_string = "null";
	} else if(typeof element === "object"){
		type_string = "object";
	} else {
		if(already_defined){
			type_string = element;
		} else {
			type_string = typeof element;
		}
	}

	return type_string
}

//recursive function for nested objects.
var recurse = function(child, required){
	var child_type = type(child, false);
	var required_type = type(required, true);

	if(child_type === "array"){
		if(required_type === "array"){
			//end the recursion - we are not testing inside arrays yet.
		} else {
			throw new CheckError({
				message: "You sent an: 'array' where we were expecting" + required_type
			});
		}
	} else {
		var required_keys = Object.keys(required);
		var child_keys = Object.keys(child);

		//check for invalid keys in this object level by matching the keys of both objects against each other.
		var invalid_keys = [];

		child_keys.forEach(function(key){
			if(required[key] === undefined){
				invalid_keys.push(key);
			}
		})

		if(invalid_keys.length > 0){
			throw new CheckError({
				message: "The following keys are not allowed and should be removed: " + invalid_keys.join(', ')
			});
		}
		////end first invalid key check


		//if the user has sent less keys than in the required spec then we can deduce that there are keys missing.
		if(required_keys.length > child_keys.length){
			var missing_keys = [];

			required_keys.forEach(function(key){
				if(child_keys.indexOf(key) === -1){
					missing_keys.push(key);
				}
			})

			throw new CheckError({
				message: "The following object keys are missing from your request: " + missing_keys.join(', ')
			})
		} else if(required_keys.length < child_keys.length) {
			//the contents of this statement should never run - our first invalid key check will protect against having more than the required number of keys.
			//we'll keep it as a precautionary measure for now.
			var invalid_keys = [];

			child_keys.forEach(function(key){
				if(required_keys.indexOf(key) === -1){
					invalid_keys.push(key);
				}
			})

			throw new CheckError({
				message: "The following object keys are not allowed and should be removed: " + invalid_keys.join(', ')
			})
		}

		child_keys.forEach(function(key){
			//if we got this far, all keys are allowed within this child object.
			
			var child_type = type(child[key], false);
			var required_type = type(required[key], true);

			//now let's check if it matches our spec.
			if(child_type === "object" && required_type === "object"){
				
				//both of our maps have objects in the same position which means we need to go deeper and search through them.
				//activate the recurse function...
				recurse(child[key], required[key])
			
			} else if(child_type === "array" && required_type === "array"){
			
				//both of our maps have arrays in the same position which means we need to go deeper and search through them.
				//activate the recurse function...
				recurse(child[key], required[key])
			
			} else if(required_type.indexOf(child_type) > -1){
			
				//do nothing! we can stop the recursion on this one. the key is a match.
			
			} else {
		
				//there is a type mismatch... throw type error.
				throw new CheckError({
					message: "Invalid type for key: \'" + key + "'. You sent: '" + child_type + "'. It needs to be: '" + required_type + "'."
				});
			}
		});
	}
}

var main = {
	test: function(item, required_format, optional_parameters){
		try{
			required_format = joinOptionalParameters(item, required_format, optional_parameters);

			recurse(item, required_format);

			return true;
		} catch(error) {
			if(error instanceof CheckError){
				error.message.full_expected_payload = required_format;
				return error;
			} else {
				Reporting.bug('Check.test', error);

				return new CheckError('System error. Our coders have been notified of this event.')
			}
		}
	},

	Error: CheckError
};

module.exports = main;