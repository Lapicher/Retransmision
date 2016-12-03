var fsToCentral = require('fs');
var socketServidor = require('socket.io-client');
var ssToCentral = require('socket.io-stream');
function newSocket(){
	return socketServidor.connect('http://172.16.102.226:51000',{reconnect:false});
}
var socket  = newSocket();
var dirTemp= './temp/';
var manageFiles = require('./concatenar');

var procesando = false;
var documentosExportados=0;
var timer = null;

// variable que contiene los folders o ambulancias para enviar sus archivos a la central.
var arrAmbulancias = [];

var TotalDocumentosExportados=0;
var TotalArchivosPartidos=0;
var SizeTotal=0;
var nfilesEnviados=0;
var nombresArchivos=[];
var ambulancia="";


function reinicia(){
	nfilesEnviados=0;
	procesando=false;
	startEnvio();
}
module.exports.start = startEnvio;
function startEnvio(){
	
	timer = setInterval(function(){
		
		if(socket==null){
			socket = newSocket();
		}
		
		manageFiles.getFilesNames(dirTemp, function(directorios){
			arrAmbulancias = directorios;
		});
	
		if(!procesando && arrAmbulancias.length>0 && socket.connected){
			procesando=true;
			clearInterval(timer);
			console.log("se detiene timer mientras trabaja el envio de los archivos....");
			// se obtiene la ambulancia para iniciar el envio de los archivos.
			ambulancia = arrAmbulancias.pop();
			// se consultan los archivos de la ambulancia.
			
			
			manageFiles.getFilesNames(dirTemp+ambulancia, function(filesCreated){
				console.log("Encontro archivos del folder "+filesCreated.length);
				
				if(filesCreated.length>2){
					if(filesCreated.indexOf('ready.txt') > -1 && 
					   filesCreated.indexOf('import.csv') > -1){
					
						nombresArchivos=filesCreated;
						// si se encuentra el archivo de ready, entonces se procedera a realizar en envio a la central.
						// se envia el id de ambulancia para identificar de que ambulancia son los archivos.
						socket.emit('ambulancia', ambulancia);
						
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
						reinicia();
					}
				}
				else
					reinicia();
			});
		}
		else
			console.log("no cumple algo, "+procesando+" "+arrAmbulancias.length+" "+socket.connected);
	},1000);
}


// EVENTOS DEL SOCKET CON LA COMUNICACION A LA CENTRAL.

/**********************************************************************************
	  Listener de conexion del socket.
**********************************************************************************/
socket.on('connect', function() {
  fsToCentral.exists(dirTemp,function(si){
	  if(!si){
		  fsToCentral.mkdir(dirTemp,function(err){
			  if(err) throw err;
			  continuaSincronizacion();
		  });
	  }
	  else {
		  continuaSincronizacion();
	  }
  });
  
  function continuaSincronizacion(){
	  if(!socket.connected){
		  isConectedSinc=true;
		  console.log( "SINCRONIZACION LISTO - conectado para sincronizar datos");
		  //socket.emit('ambulancia',global.IDConfig);
	  }
  }
});
/**********************************************************************************
	  Listener de desconexion del socket.
**********************************************************************************/
socket.on('disconnect',function(){
	console.log("Se desconecto el socket sincronizacion.......");
	//global.socketInicio.emit('sincronizacion.falla');
	socket = null;
	reinicia();
});

/**********************************************************************************
      Modulo que inicia la sincronizacion, exporta los datos de mongo, crea el archivo
      a exportar, parte archivo si es demaciado grande y inicia el proceso de enviar los
      archivos partidos a la central.
**********************************************************************************/

function iniciaDescarga(Amb){
	console.log(Amb);
	nfilesEnviados=0;
    if(socket.connected){
        
		  TotalArchivosPartidos = nombresArchivos.length-2; // menos uno que es el archivo exportado principal.
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


/**********************************************************************************
	eventos socket de secuencia del envio de archivos.
**********************************************************************************/
//responde el servidor que recibio el total de docuemtnos exportados correctamente.
socket.on('docsTotales.ok',function(data){
	console.log("docsTotales recibidos, enviara Total de partes: "+TotalArchivosPartidos);
	socket.emit('filesTotales.data',TotalArchivosPartidos);
});
/**********************************************************************************
	responde la central que recibio el numero de partes del archivo correctamente.
**********************************************************************************/
socket.on('filesTotales.ok',function(data){

	socket.emit('size.archivo', SizeTotal);
	console.log("envio tamaño total: "+SizeTotal);
});
socket.on('size.ok',function(){

	// ya que recibio los parametros de inicio se puede iniciar con el envio de los archivos.
	console.log("archivos: "+nombresArchivos.length+ " Enviados: "+nfilesEnviados);
	console.log("Aqui enviara el primer archivo");

	if (nfilesEnviados==0) {
		enviaPiezaSiguiente();
	}
});
/**********************************************************************************
	  EVENTO PRINCIPAL DEL SOCKET SINCRONIZACION. envia los archivos a la
	  central.
**********************************************************************************/
socket.on('enviado.correcto',function(inf){
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
		  socket.emit('descarga.Finalizada');
	}
});
/**********************************************************************************
	  responde que los archivos recibidos en la central estan completos. OK.
**********************************************************************************/
socket.on('descarga.ok',function(){
	//console.log("PROCESO TERMINADA");
	// se prosigue a eliminar los datos de la colleccion sensores en mongo.
	
	
	manageFiles.eliminarTemporales(dirTemp+ambulancia+"/" ,function(ok){
		  if(ok){
			  console.log("se eliminaron los archivos temporales");
		  }
		  else {
			  console.log("No se eliminaron los temporales");
		  }
		  socket.disconnect();
		  console.log("TERMINO DE SINCRONIZAR LA AMBULANCIA: "+ambulancia);
	});
});
/**********************************************************************************
	  responde que los archivos recibidos en la central estan completos. FAIL.
	  FALLO DE LA CENTRAL.
**********************************************************************************/
socket.on('descarga.fail',function(){

	  //los archivos recibidos en la central no estan completos.
	  console.log("Fallo la descarga, volver a intentar");
	  nfilesEnviados=0;
	  reinicia();
});


//var valorExportado = concat.readFile(PathTemp+"Amb01/"+"ready.txt");
//console.log("valor leido: "+ valorExportado);


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
  }
}

function enviaPiezaSiguiente(){
    if(socket.connected){
        send(nombresArchivos[nfilesEnviados], dirTemp+ambulancia+"/"+nombresArchivos[nfilesEnviados]);
    }
}