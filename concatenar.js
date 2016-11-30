/******************************************************************************
. Centro de Ingeniería y Desarrollo Industrial
. Nombre del módulo:    concatenar.js
. Lenuaje:              Javascript
. Propósito:    Este módulo contiene la lógica para volver a unir las partes
.								enviadas desde la ambulancia y crear un archivo completo csv.
.
.
. Desarrollado por:     Nataly Janeth Contreras Ramírez.
******************************************************************************/

var concat=require('concat-files');
var fs = require("fs");

//var pathDestino='temp/';
var archivoGenerado='import.csv'

module.exports.Unir=function(pathDestino,callback){
	/*
				retorna en el callback el nombre del archivo final unido o si huvo falla
				retorna un null.
	*/
	console.log("LOGRO ENTRAR EN UNIR: "+pathDestino+archivoGenerado);
	getFilesNames(pathDestino,function(files){
		if(files.length){
			// revisa el arreglo de nombre de archivos para eliminar nombres raros y apregarles la ruta
			searchStringInArray('.csv',files);
			function searchStringInArray (str, strArray) {
					for (var j=0; j<strArray.length; j++) {
							if (strArray[j].match(str))
									strArray[j]=pathDestino+strArray[j];
							else
							{
									strArray.splice(j,1);
									j--;
							}
					}
			}
			// concatena todos los archivos en uno solo final. Si solo es un archivo no hace nada
			if(files.length>1){
				concat(files,pathDestino+archivoGenerado,function(){
					callback(pathDestino+archivoGenerado);
				});
			}
			else if(files.length===1){
					callback(files[0]);
			}
			else {
					callback(null);
			}
		}
		else{
			console.error("No hay archivos en el directorio");
			callback(null);
		}
	});
}

function getFilesNames(directorio,callback){
	fs.readdir(directorio, function(err, files) {
		if(err) callback([]);
		callback(files);
	});
}
module.exports.getFilesNames = getFilesNames;
/*
			Funcion para obtener el tamaño de un archivo que se le indique por el argumento.
*/
module.exports.getFilesizeInBytes = function(filename){
     var stats = fs.statSync(filename);
     var fileSizeInBytes = stats["size"];
     return fileSizeInBytes;
}
module.exports.eliminarTemporales=function(pathDestino, callback){
	/*
				Metodo para eliminar los archivos temporales recibidos de la ambulancia.
				retorna true se eliminaron los archivos correctamente, false de que no
				se eliminaron por completo.
	*/
	getFilesNames(pathDestino,function(files){
		console.log(files);
		if(files!=null){
				if(files.length>0){
					var cont=0;
					for(i=0;i<files.length;i++){
						fs.unlink(pathDestino+files[i], function(err){
								//comprobamos si ha ocurrido algun error
								if(err){
										console.error(err);
										i=files.length;
										callback(false);
								}
								//informamos de que el fichero ha sido eliminado
								else{
										cont++;
										if(cont===files.length)
										{
												console.log("Todos los archivos fueron eliminados");
												callback(true);
										}
								}
						});
					}
				}
				else {
						callback(true);
				}
		}
		else {
			callback(false);
		}

	});
}

module.exports.newFile= function(nombreFile, datos){
	// crea el archivo.
	var writeStream = fs.createWriteStream(nombreFile);
    fs.createWriteStream(nombreFile);
	
	// escribe en el archivo.
	writeStream.write(datos);
	writeStream.end();
}
module.exports.readFile = function(file){
	var data = fs.readFileSync(file);
	return data.toString();
}
