/******************************************************************************
. Centro de Ingeniería y Desarrollo Industrial
. Nombre del módulo:    sinc.js
. Lenuaje:              Javascript
. Propósito:    Este modulo se encarga de revisar cada segundo el directorio 
.				donde se estan guardando los archivos sincronizados desde los
.				maletines, al encontrar archivos en uno de los subfolders, inicia
.				el proceso de sincronizarlos ahora con el servidor central.
.				Al no existir conexion con la central, se siguen guardando los
.				archivos de los maletines y en cuanto exista conexion, se inicia
.				la sincronizacion a la central.
.
.
. Desarrollado por:     Nataly Janeth Contreras Ramírez.
******************************************************************************/
var config = require('./config.json');
var fsToCentral = require('fs'),
	path = require('path');
var socketServidor = require('socket.io-client');
var ssToCentral = require('socket.io-stream');
var dirTemp= './temp/';
var manageFiles = require('./concatenar');

var procesando = false;
var documentosExportados=0;
var timer = null;
timerSubfolders= null;
var compuEsclava = config.nombreEquipoSinc;
var archivosExcluidosSincronizacion = 3;

// variable que contiene los folders o ambulancias para enviar sus archivos a la central.
var arrDirSincro = [];
var posicionArrDirSincro=0;

var TotalDocumentosExportados=0;
var TotalArchivosPartidos=0;
var SizeTotal=0;
var nfilesEnviados=0;
var nombresArchivos=[];
var ambulancia="";

// Funcion para leer todos los directorios de datos sincronizados desde los maletines.
function getDirectories(srcpath) {
  var arrRetornar = [];
  var foldersAmbulancias = fsToCentral.readdirSync(srcpath);
  for(amb in foldersAmbulancias){
	  var subfolders = fsToCentral.readdirSync(srcpath+"/"+foldersAmbulancias[amb]);
	  for(subfolder in subfolders){
		  arrRetornar.push(foldersAmbulancias[amb]+"/"+subfolders[subfolder]);
	  } 
  }
  return arrRetornar;
}
function getFiles(srcpath) {
  return fsToCentral.readdirSync(srcpath).filter(function(file) {
		return fsToCentral.statSync(path.join(srcpath, file));
  });
}

function eliminaCarpeta(pathfolder){
	fsToCentral.rmdirSync(pathfolder);
}


function newSocket(){
	var socketInterno = socketServidor.connect('http://'+config.ipServidor+':'+config.puertoServidor,{reconnect:false});
	socketInterno.eliminado=false;
	/**********************************************************************************
		  Listener de conexion del socket.
	**********************************************************************************/
	function continuaSincronizacion(){
		if(!socketInterno.connected){
			isConectedSinc=true;
			console.log( "SINCRONIZACION SERVIDOR -");
		}
	}
	
	socketInterno.on('connect', function() {
		console.log("SINCRONIZACION CONECTADA A SERVIDOR");
	});
	
	// EVENTOS DEL SOCKET CON LA COMUNICACION A LA CENTRAL.
	  
	/**********************************************************************************
		eventos socket de secuencia del envio de archivos.
	**********************************************************************************/
	//responde el servidor que recibio el total de docuemtnos exportados correctamente.
	socketInterno.on('docsTotales.ok',function(data){
		console.log("********* docsTotales recibidos, enviara Total de partes: "+TotalArchivosPartidos);
		socketInterno.emit('filesTotales.data',TotalArchivosPartidos);
	});
	/**********************************************************************************
		responde la central que recibio el numero de partes del archivo correctamente.
	**********************************************************************************/
	socketInterno.on('filesTotales.ok',function(data){

		socketInterno.emit('size.archivo', SizeTotal);
		console.log("********** envio tamaño total: "+SizeTotal);
	});
	
	/*  Tamaño del archivo final */
	socketInterno.on('size.ok',function(){

		// ya que recibio los parametros de inicio se puede iniciar con el envio de los archivos.
		console.log("archivos: "+nombresArchivos.length+ " Enviados: "+nfilesEnviados);
		console.log("********** Aqui enviara el primer archivo");

		if (nfilesEnviados==0) {
			enviaPiezaSiguiente();
		}
	});
	/**********************************************************************************
		  EVENTO PRINCIPAL DEL SOCKET SINCRONIZACION. envia los archivos a la
		  central.
	**********************************************************************************/
	socketInterno.on('enviado.correcto',function(inf){
		//console.log("METODO ARCHIVO ENVIADO CORRECTO!!!!!!!!");
		enviandoArchivo=false;

		nfilesEnviados++;
		//console.log('Archivo enviado Satisfactoriamente '+nfilesEnviados+ "porcentaje: "+porcentaje);

		// vuelve a enviar los archivos restantes si no son el total.
		if(nfilesEnviados<TotalArchivosPartidos)
		{
			enviaPiezaSiguiente();
		}
		else {
			  // manda mensaje a la central si es correcto el numero total de archivos enviados.
			  socketInterno.emit('descarga.Finalizada');
		}
	});
	/**********************************************************************************
		  responde que los archivos recibidos en la central estan completos. OK.
	**********************************************************************************/
	socketInterno.on('descarga.ok',function(){
		//console.log("PROCESO TERMINADA");
		// se prosigue a eliminar los datos de la colleccion sensores en mongo.
		
		manageFiles.eliminarTemporales(dirTemp+ambulancia+"/" ,function(ok){
			  if(ok){
				  console.log("se eliminaron los archivos temporales");
			  }
			  else {
				  console.log("No se eliminaron los temporales");
			  }
			  socketInterno.disconnect();
			  console.log("******** TERMINO DE SINCRONIZAR LA AMBULANCIA: "+ambulancia);
		});
	});
	/**********************************************************************************
		  responde que los archivos recibidos en la central estan completos. FAIL.
		  FALLO DE LA CENTRAL.
	**********************************************************************************/
	socketInterno.on('descarga.fail',function(){
		  //los archivos recibidos en la central no estan completos.
		  console.log("Fallo la descarga, volver a intentar");
		  nfilesEnviados=0;
		  reinicia();
	});

	/**********************************************************************************
		  Listener de desconexion del socket.
	**********************************************************************************/
	socketInterno.on('disconnect',function(){
		console.log("Se desconecto el socket sincronizacion.......");
		//global.socketInicio.emit('sincronizacion.falla');
		socketInterno.eliminado=true;

		if(procesando)
			reinicia();
	});

	return socketInterno;
}
var socket  = newSocket();

function reinicia(){
	nfilesEnviados=0;
	procesando=false;
	startEnvio();
}

module.exports.start = startEnvio;
var filesBasura=0;
var contveces=0;
function startEnvio(){
		
	timer = setInterval(function(){
		
		
		if(socket.eliminado){
			console.log(" ######### CREO NUEVO SOCKET #############################");
			socket = newSocket();
		}
		
		arrDirSincro = getDirectories(dirTemp);
		
		//console.log(getFiles(dirTemp+"/"+arrDirSincro[0]+"/"));
	
		if(!procesando && arrDirSincro.length>0 && socket.connected){
			procesando=true;
			clearInterval(timer);
			//console.log("se detiene timer mientras trabaja el envio de los archivos....");
			
			var filesCreated=[];
			
			// se obtiene la ambulancia para iniciar el envio de los archivos.
			for(pos in arrDirSincro){
				ambulancia = arrDirSincro[pos];
				// se consultan los archivos de la ambulancia.
				filesCreated = getFiles(dirTemp+arrDirSincro[pos]);
				// en caso de que el subfolder no tenga archivos, se continua con otra carpeta.
				// si si existen archivos para sincronizar, se detiene el for.
				if(filesCreated.length>2)
					break;
				else if(filesCreated.length==0){
					// si es un folder vacio se elimina.
					eliminaCarpeta(dirTemp+ambulancia);
				}
			}
			
			
			if(filesCreated.length>2){
				if(filesCreated.indexOf('ready.txt') > -1 && 
				   filesCreated.indexOf('import.csv') > -1){
				
					nombresArchivos=filesCreated;
					// si se encuentra el archivo de ready, entonces se procedera a realizar en envio a la central.
					// se envia el id de ambulancia para identificar de que ambulancia son los archivos.
					socket.emit('ambulancia', compuEsclava);
					
					var fileReady= dirTemp+ambulancia+"/ready.txt";
					TotalDocumentosExportados = parseInt(manageFiles.readFile(fileReady));
					TotalDocumentosExportados = (TotalDocumentosExportados > 0)? TotalDocumentosExportados:0;
					var fileImported = dirTemp+ambulancia+"/import.csv";
					SizeTotal = manageFiles.getFilesizeInBytes(fileImported);
					console.log("DOcst: "+TotalDocumentosExportados+ " Bytes: "+SizeTotal);
					iniciaDescarga(ambulancia);
				}
				else{
					console.log("no encontro el archivo READY");
					
					// colocar aqui, que si a la 5 vez no hay ready quiere decir que hasta ahi se quedo,
					// y eliminar esos datos basura.
					// o no a la 15 ves sino tambien contar los archivos, si va cambiando seguir esperando.
					// ya cuando no cambie que elimine esos archivos basura.
					// todo esto antes de reiniciar().
					contveces++;
					
					if(contveces==30 && filesBasura == filesCreated.length ){
						contveces=0;
						manageFiles.eliminarTemporales(dirTemp+ambulancia+"/" ,function(ok){
							  if(ok){
								  console.log("se eliminaron los archivos basura: "+ambulancia);
							  }
							  else {
								  console.log("No se eliminaron los archivos basura");
							  }
						});
					}
					else
						console.log("encontro elementos basura: "+contveces);
						
					filesBasura = filesCreated.length;
					reinicia();
				}
			}
			else{
				reinicia();
			}
		}
		else{
			//console.log("no cumple algo, "+procesando+" "+arrDirSincro.length+" "+socket.connected);
		}
			
	},1000);
}



/**********************************************************************************
      Modulo que inicia la sincronizacion, exporta los datos de mongo, crea el archivo
      a exportar, parte archivo si es demaciado grande y inicia el proceso de enviar los
      archivos partidos a la central.
**********************************************************************************/

function iniciaDescarga(Amb){
	console.log(Amb);
	nfilesEnviados=0;
    if(socket.connected){
        
		  TotalArchivosPartidos = nombresArchivos.length-archivosExcluidosSincronizacion; // menos uno que es el archivo exportado principal.
		  console.log("se partieron correctamente los archivos: "+TotalArchivosPartidos);
		  /**********************************************************************************
				logica para enviar a la central.
				le avisa a la central el Total de Docuemtnos Exportados.
		  **********************************************************************************/
		  if(socket.connected)
			  socket.emit('docsTotales.data', TotalDocumentosExportados);
		  else {
			  console.error("no esta conectado");
			  socket.emit('descarga.fail');
			  reinicia();
		  }        
    }
    else {
        console.log("No se encuentra conectado al servidor");
        global.socketInicio.emit('sincronizacion.desconectado');
    }
}


/*
    inicia timer para revisar la conexion del socket en el proceso de sincronizacion
    de que en algun momento sucede que se desconecta y el proceso se encuentra a la
    mitad no se quede ninguna de las dos partes central y movil esperando los mensajes.
*/

function send(nombreArchivo,archivo){
  //console.log("METODO ENVIAR");
  if(socket.connected){
      enviandoArchivo=true;
      stream = ssToCentral.createStream();
      ssToCentral(socket).emit('archivo.enviado', stream, {name: nombreArchivo});
      fsToCentral.createReadStream(archivo).pipe(stream);
  }
  else {
      console.log("No se encuentra conectado el modulo de sincronizacion");
      //global.socketInicio.emit('sincronizacion.falla');
	  reinicia();
  }
}

function enviaPiezaSiguiente(){
    if(socket.connected){
        send(nombresArchivos[nfilesEnviados], dirTemp+ambulancia+"/"+nombresArchivos[nfilesEnviados]);
    }
}