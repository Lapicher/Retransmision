/******************************************************************************
. Centro de Ingeniería y Desarrollo Industrial
. Nombre del módulo:    sinc.js
. Lenuaje:              Javascript
. Propósito:    Este módulo contiene la lógica para la sincronizacion con cada
.               nitrogen de las ambulancias, es el encargado de guardar los datos
.               en la central y unir las partes recibidas por cada ambulancia.
.
.
. Desarrollado por:     Nataly Janeth Contreras Ramírez.
******************************************************************************/
  var io = require('socket.io').listen(2016);
  var ss = require('socket.io-stream');
  var path = require('path');

  var fs  = require('fs'),
	  concat=require('./concatenar');

  var PathTemp='./temp/';
  var arrSockets=[];


  // PARAMETROS EN FORMA DE PROTOTYPE PARA VALORES UNICOS PARA CADA SOCKET CONECTADO.
  function Parametros(){
  }
  Parametros.prototype.TotalExportados=null;
  Parametros.prototype.TotalPartes=0;
  Parametros.prototype.nRecibidos=0;
  Parametros.prototype.SizeTotal=0;
  Parametros.prototype.ambulancia="";


  /********************************************************************************************************
		  METODO DE CONEXION DEL SOCKET.
   *******************************************************************************************************/
   io.sockets.on('connection', function(socket){

	 socket.isConected=true;
	 console.log("SINCRONIZACION de Signos Vitales - Ambulancia conectada para sincronizar");

	 socket.on('ambulancia',function(serie){

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
			socket.parametros=new Parametros();
			socket.parametros.ambulancia=serie;
			socket.parametros.nRecibidos=0;
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
			  fs.exists(PathTemp+serie,function(si){
				  if(!si){
					fs.mkdir(PathTemp+serie,function(err){
						if(err) console.error("NO SE PUDO CREAR LA CARPETA TEMPORAL DE LOS ARCHIVOS DEL FRAP PARA SINCRONIZAR, "+err);
						console.log("se creo el directorio");
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

		  var path=PathTemp+socket.parametros.ambulancia+"/"+data.name;
		  canWrite(PathTemp+socket.parametros.ambulancia,function(err,isWriteable){
			  if(isWriteable && !err){
				  stream.pipe(fs.createWriteStream(path).on('close',function(err){
					if(err){
						console.log('File could not be saved.');
						socket.emit('descarga.fail');
						socket.parametros.nRecibidos=0;
						eliminaTemporales(socket.parametros.ambulancia);
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
					
					
					concat.Unir(PathTemp+socket.parametros.ambulancia+"/",function(archivo){
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
				socket.parametros.nRecibidos=0;

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
		  socket.parametros.nRecibidos=0;
		  console.log("Ambulancia sincronizacion DESCONECTADA");
		  socket.isConected=false;
		  socket.leave(socket.room);

		  concat.eliminarTemporales(PathTemp+socket.parametros.ambulancia+"/",function(del){
			  //console.log("Eliminacion de los temporarles: "+del);
			  if(del){
				fs.exists(PathTemp+socket.parametros.ambulancia,function(si){
					if(!si){
					  fs.rmdir(PathTemp+"/"+socket.parametros.ambulancia, function(err){
						  if(err)
							  console.log("ocurrio un error: "+err);
					  });
					}
				  });
			  }
		  });

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
		concat.eliminarTemporales(PathTemp+carpeta+"/",function(del){
			//console.log("Eliminacion de los temporarles: "+del);
		});
	}
	/********************************************************************************************************
			METODO PARA INFORMAR A LA AMBULANCIA ALGUN ERROR EN EL PROCESO DE LA SINCRONIZACION. Y ELIMINA
			LOS ARCHIVOS TEMPORALES RECIBIDOS.
	 ********************************************************************************************************/
	function informaFalla(soc){
		soc.emit('descarga.fail');
		console.log("Falla");
		soc.parametros.nRecibidos=0;
		eliminaTemporales(soc.parametros.ambulancia);
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
