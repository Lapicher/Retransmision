/******************************************************************************
. Centro de Ingeniería y Desarrollo Industrial
. Nombre del módulo:    socket.stream.js
. Lenuaje:              Javascript
. Propósito:    Este módulo contiene la lógica para la sincronizacion con cada
.               nitrogen de las ambulancias, es el encargado de guardar los 
.				archivos partidos por la nitrogen. En este archivo se manda aLinkcolor
.				correr el proceso en background que se encarga de revisar cada cierto 
.				tiempo si hay archivos que sincronizar.
.
.
. Desarrollado por:     Nataly Janeth Contreras Ramírez.
******************************************************************************/
  var configClient = require('./config.json');
  var io = require('socket.io').listen(configClient.puertoCliente);
	
  var ss = require('socket.io-stream');
  var path = require('path');

  var fs  = require('fs'),
	  concat=require('./concatenar'),
	  proceso = require('./toCentral');

  var PathTemp='./temp/';
  var arrSockets=[];

  
  // configuracion para el servidor socket para revisar que en un segundo desconecte el socket
  // sino muestra señal de conectado.
  io.set('heartbeat timeout', 1000); 
  io.set('heartbeat interval', 100);
  
  // inicia el proceso en segundo plano con timer para conectarse a la central y
  // enviarle los archivos uno a uno a la central de cada maletin almacenado en esta
  // pc. Y al finalizar importar los datos en mongo en la central.
  proceso.start();
  
  
  // PARAMETROS EN FORMA DE PROTOTYPE PARA VALORES UNICOS PARA CADA SOCKET CONECTADO.
  function Parametros(){
  }
  Parametros.prototype.TotalExportados=null;
  Parametros.prototype.TotalPartes=0;
  Parametros.prototype.nRecibidos=0;
  Parametros.prototype.SizeTotal=0;
  Parametros.prototype.ambulancia="";
  Parametros.prototype.subfolder="";


  /********************************************************************************************************
		  METODO DE CONEXION DEL SOCKET.
   *******************************************************************************************************/
   io.sockets.on('connection', function(socket){

	 socket.isConected=true;
	 console.log("SINCRONIZACION RECEPTOR de Signos Vitales -");

	 socket.on('ambulancia',function(serie){

		socket.parametros=new Parametros();
		socket.parametros.ambulancia=serie;
		socket.parametros.nRecibidos=0;
			
		
		console.log("Recibi los parametros del numero de Serie de la Ambulancia: "+serie);
		var yaExiste=0;
		arrSockets.forEach(function(soc){
			 if(soc.parametros.ambulancia===serie)
				yaExiste++;
		});

		/********************************************************************************************************
				NOTA: EN CASO DE QUE UNA AMBULANCIA CON EL MISMO NUMERO DE SERIE QUIERA CONECTAR, SE DESCONECTARA
				AUTOMATICAMENTE, SINO SE AGREGA AL ARREGLO LOCAL DE SOCKETS O AMBULANCIAS CONECTADAS.
		 ********************************************************************************************************/
		if(!yaExiste){
			
			arrSockets.push(socket);

			//console.log("total de sockets conectados: "+arrSockets.length);
			fs.exists(PathTemp,function(si){
				if(si){
					console.log(si);
					creaFolderAmb();
				}
				else {
					fs.mkdir(PathTemp,function(err){
						if(err) console.error("NO SE PUDO CREAR LA CARPETA TEMPORAL DE LOS ARCHIVOS DEL FRAP PARA SINCRONIZAR, "+err);
						creaFolderAmb();
					});
				}
			});

			function creaFolderAmb(){
			  var folderAmb = PathTemp+serie;
			  fs.exists(folderAmb,function(si){
				  if(!si){
					fs.mkdir(folderAmb,function(err){
						if(err) console.error("NO SE PUDO CREAR LA CARPETA TEMPORAL DE LOS ARCHIVOS DEL FRAP PARA SINCRONIZAR, "+err);
						else{
							console.log("se creo el directorio");
							creaSubFolderTime(folderAmb);
						}
						
					});
				  }
				  else{
					  creaSubFolderTime(folderAmb);
				  }
			  });
			}
			function creaSubFolderTime(dir){
				var tiempo = new Date();
				var subfolderTime = "" + tiempo.getFullYear()+tiempo.getMonth()+tiempo.getDay()+tiempo.getHours()+tiempo.getMinutes();
				subfolderTime = dir+"/" + subfolderTime;
				fs.exists(subfolderTime, function(si){
					if(!si){
						fs.mkdir(subfolderTime, function(err){
							if(err) console.error("NO SE PUDO CREAR EL SUBFOLDER");
							else{
								console.log("Creara archivo de conectado: "+subfolderTime);
								fs.writeFileSync(subfolderTime+"/z.txt","");
								socket.parametros.subfolder = subfolderTime;
							}
								
						});
					}
				});
			}
		}
		else {
		  if (io.sockets.sockets[socket.id]) {
			  console.log("socket intruso desconectado");
			  io.sockets.sockets[socket.id].disconnect();
		  }
		}
	 });

	  /********************************************************************************************************
			  LISTENER PARA RECIBIR LOS DOCUMENTOS TOTALES A IMPORTAR
	  ********************************************************************************************************/
	  socket.on('docsTotales.data',function(data){

		  // en caso de que existe algun temporal que no se haya borrado, al iniciar
		  // el proceso de sincronizacion se intenta borrar los archivos que se encuentren
		  // para recibir los nuevos archivos.
		 socket.parametros.TotalExportados=data;
		 socket.emit('docsTotales.ok');
		 /*
		  concat.eliminarTemporales(PathTemp+socket.parametros.ambulancia+"/",function(del){
			  if(del){
				  //console.log("Docuemtnos Totales: "+data);
				  socket.parametros.TotalExportados=data;
				  socket.emit('docsTotales.ok');
			  }
			  else {
				  informaFalla(socket);
			  }
		  });
		  */
		  
	  });
	  /********************************************************************************************************
			  LISTENER PARA RECIBIR LOS ARCHIVOS TOTALES O PARTES A UNIR.
	  ********************************************************************************************************/
	  socket.on('filesTotales.data',function(data){
		  //console.log("Archivos Totales: "+data);
		  socket.parametros.TotalPartes=data;
		  socket.emit('filesTotales.ok');
	  });
	  /********************************************************************************************************
			  LISTENER PARA RECIBIR EL TAMAÑO TOTAL DEL ARCHIVO A IMPORTAR
	   ********************************************************************************************************/
	  socket.on('size.archivo',function(size){
		  //console.log("Tamaño total del archivo a importar: "+size);
		  socket.parametros.SizeTotal=size;
		  socket.emit('size.ok');
	  });

	  /********************************************************************************************************
			  LISTENER PARA RECIBIR LOS ARCHIVOS PARTIDOS
	   ********************************************************************************************************/
	  ss(socket).on('archivo.enviado', function(stream, data) {

		  var path=socket.parametros.subfolder+"/"+data.name;
		  canWrite(socket.parametros.subfolder,function(err,isWriteable){
			  if(isWriteable && !err && socket.connected){
				  stream.pipe(fs.createWriteStream(path).on('close',function(err){
					if(err){
						console.log('File could not be saved.');
						socket.emit('descarga.fail');
						socket.parametros.nRecibidos=0;
						eliminaTemporales(socket.parametros.subfolder);
					}else{
						//console.log("id: "+socket.id);
						console.log('File saved.');
						socket.parametros.nRecibidos++;
						socket.emit('enviado.correcto');
					}
				  }));
			  }
			  else {
				  console.log('No se pudo guardar archivo, DIRECTORIO SIN ACCESSO');
				  socket.emit('descarga.fail');
				  socket.parametros.nRecibidos=0;
			  }
		  });
	  });

	  /********************************************************************************************************
			  LISTENER DE FINALIZAR, SE ENCARGA DE UNIR LAS PARTES E IMPORTAR LOS DATOS
	   ********************************************************************************************************/
	  socket.on('descarga.Finalizada',function(){
		  // la ambulancia anuncia que termino de enviar todos sus archivos.
		  // se revisa si el numero de archivos recibidos es igual al dicho en
		  // la variable TotalPartes.

				//console.log("Total de Recibidos: "+ socket.parametros.nRecibidos);

				if(socket.parametros.nRecibidos===socket.parametros.TotalPartes){
					// se empieza el proceso de concatenar los archivos para crear uno solo y
					// importar los datos.
					// .......
					//console.log("Se recibieron todas las partes correctamente, ahora vamos a unir");
					
					
					concat.Unir(socket.parametros.subfolder+"/",function(archivo){
						if(archivo!==null){
							//console.log("Archivo final para importar: "+archivo);

							// se valida el tamaño del archivo final
							var size=concat.getFilesizeInBytes(archivo);
							//console.log("archivo: "+archivo);
							//console.log("TAMAÑO FINAL del Archivo: "+ size);

							if(socket.parametros.SizeTotal == size){
								// ya que se unieron las partes correctamente se continua a importar
								// los datos en la base.

								console.log("Termino, listo, ARCHIVOS RECIBIDOS........ y unidos en un archivo, tamaño bien");
								socket.emit('descarga.ok');
								console.log("emit de finalizacion enviado");
								// crea un archivo ready.txt solo para indicarle a la tarea en brackground que el folder esta listo.
								// para ser enviaod a la central.
								var pathReady = socket.parametros.subfolder+"/"+"ready.txt";
								//concat.newFile(pathReady, socket.parametros.TotalExportados.toString());
								concat.newFile(pathReady, socket.parametros.TotalExportados.toString(), function(ok){
									if(ok){
										console.log("Si se pudo crear el READY.TXT")
									}
									else
										console.log("No se creo el ready.txt");
								});
							}
							else {
								informaFalla(socket);
							}
						}
						else {
							informaFalla(socket);
						}
					});
					
					console.log("Recibidos: "+socket.parametros.nRecibidos);
				}
				else {
					informaFalla(socket);
				}
	  });

	  /********************************************************************************************************
			  METODO EN CASO DE FALLA, REINICIA VARIABLES, ELIMINA TEMPORALES.
	   ********************************************************************************************************/
	  socket.on('descarga.fail',function(){
		  informaFalla(socket);
	  });

	  /********************************************************************************************************
			  LISTENER PARA DESCONECTAR
	   ********************************************************************************************************/
	  socket.on('disconnect',function(){
		  
		  if(socket.parametros.nRecibidos!='undefined'){
			  if(socket.parametros.nRecibidos < socket.parametros.TotalPartes){
				
				  // elimina los archivos en caso de que haya habido una desconexion sin terminar de sincronizar.
				  concat.eliminarTemporales(socket.parametros.subfolder+"/",function(del){
					  //console.log("Eliminacion de los temporarles: "+del);
					  if(!del) console.error("No elimino archivos");
				  });
			  }
			  if(fs.existsSync(socket.parametros.subfolder+"/")){
				  var numeroArchivosSincronizados = getFiles(socket.parametros.subfolder+"/").length;
				  // pregunta si al desconecatar solo esta el archivo z.txt quiere decir que no sincronizo, por tanto
				  // eliminamos ese archivo.
				  if(numeroArchivosSincronizados<2){
					  concat.eliminarTemporales(socket.parametros.subfolder+"/",function(del){
						  if(!del) console.error("No elimino archivos");
						  else
							  fs.rmdirSync(socket.parametros.subfolder+"/");
					  });
				  }
			  }
			  socket.parametros.nRecibidos=0;
		  }
		  else
			  console.log("es undefinido nRecibidos, pero se controlo");
		  
		  
		  //if(socket.parametros!='undefined')
				
		  console.log("Ambulancia sincronizacion DESCONECTADA");
		  socket.isConected=false;
		  socket.leave(socket.room);
		  
		  var posSoc=arrSockets.indexOf(socket);
		  if(posSoc!=-1)
			  arrSockets.splice(posSoc,1);
		  //console.log("tamaño de arrglo sockets: "+arrSockets.length);
	  });
	});
	/********************************************************************************************************
			METODO PARA ELIMINAR LOS ARCHIVOS TEMPORALES RECIBIDOS DE LA AMBULANCIA.
			NOTA: EL ARGUMENTO CARPETA CREA UN FOLDER EN LA CARPETA TEMP DONDE SE GUARDARAN LOS ARCHIVOS A UNIR
			DE LA AMBULANCIA Y EL NOMBRE SERA EL MISMO DE LA AMBULANCIA.
	 ********************************************************************************************************/
	function eliminaTemporales(carpeta){
		concat.eliminarTemporales(carpeta+"/",function(del){
			//console.log("Eliminacion de los temporarles: "+del);
			if(del) fs.rmdirSync(carpeta);
		});
	}
	/********************************************************************************************************
			METODO PARA INFORMAR A LA AMBULANCIA ALGUN ERROR EN EL PROCESO DE LA SINCRONIZACION. Y ELIMINA
			LOS ARCHIVOS TEMPORALES RECIBIDOS.
	 ********************************************************************************************************/
	function informaFalla(soc){
		soc.emit('descarga.fail');
		console.log("Falla");
		if(soc.parametros!=undefined)
			soc.parametros.nRecibidos=0;
		eliminaTemporales(soc.parametros.subfolder);
		//clearInterval(this.timer);
	}
	/********************************************************************************************************
			  METODO PARA PREGUNTAR SI EL DIRECTORIO SE PUEDE ESCRIBIR.
	 ********************************************************************************************************/
	function canWrite(path, callback) {
		fs.access(path, fs.W_OK, function(err) {
		  callback(null, !err);
		});
	}
	/********************************************************************************************************
			  METODO PARA OBTENER UN ARREGLO DE ARCHIVOS CONTENIDO EN EL PATH DEL ARGUMENTO.
	 ********************************************************************************************************/
	function getFiles(srcpath) {
	  return fs.readdirSync(srcpath).filter(function(file) {
			return fs.statSync(path.join(srcpath, file));
	  });
	}
