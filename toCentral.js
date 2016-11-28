var fs = require('fs');
var socketServidor = require('socket.io-client');
var ss = require('socket.io-stream');
var socket  = socketServidor.connect('http://172.16.103.154:51000',{reconnect:true});
var dirTemp= './temp/';
var archivos = require('./concatenar');

var procesando = false;
var documentosExportados=0;
var timer = null;

module.exports.start = function(){
	timer = setInterval(function(){
		if(!procesando){
			
		}
		console.log("tiempo corriendo..");
		console.log(arrAmbulancias);
	},1000);
}
// variable que contiene los folders o ambulancias para enviar sus archivos a la central.
var arrAmbulancias = [];

var TotalDocumentosExportados=0;
var TotalArchivosPartidos=0;
var SizeTotal=0;
var nfilesEnviados=0;
var nombresArchivos=[];

archivos.getFilesNames(dirTemp, function(directorios){
	arrAmbulancias = directorios;
});

// EVENTOS DEL SOCKET CON LA COMUNICACION A LA CENTRAL.
/**********************************************************************************
	eventos socket de secuencia del envio de archivos.
**********************************************************************************/
//responde el servidor que recibio el total de docuemtnos exportados correctamente.
socket.on('docsTotales.ok',function(data){
	socket.emit('filesTotales.data',TotalArchivosPartidos);
});
/**********************************************************************************
	responde la central que recibio el numero de partes del archivo correctamente.
**********************************************************************************/
socket.on('filesTotales.ok',function(data){

	socket.emit('size.archivo',SizeTotal);
	//console.log("envio tamaño total: "+SizeTotal);
});
socket.on('size.ok',function(){

	// ya que recibio los parametros de inicio se puede iniciar con el envio de los archivos.
	//console.log("archivos: "+nombresArchivos.length+ " Enviados: "+nfilesEnviados);

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

	porcentaje=parseInt((nfilesEnviados*100)/TotalArchivosPartidos);
	if(porcentaje==100)
		porcentaje=98;
	if(global.socketInicio)
		global.socketInicio.emit('update.porcentaje', parseInt(porcentaje,10));
	// vuelve a enviar los archivos restantes si no son el total.
	if(nfilesEnviados<TotalArchivosPartidos)
	{
		enviaPiezaSiguiente();
	}
	else {
		  // manda mensaje a la central si es correcto el numero total de archivos enviados.
		  socket.emit('descarga.Finalizada');
		  // se elimina archivos temporales creados y en la base de datos tambien se elimina los
		  // datos de los sensores ya que se valido que en la central se guardaron los datos.
		  split.eliminarTemporales(temp,function(ok){
			  if(ok){
				  console.log("se eliminaron los archivos temporales");
			  }
			  else {
				  console.log("No se eliminaron los temporales");
			  }
		  });
	}
});
/**********************************************************************************
	  responde que los archivos recibidos en la central estan completos. OK.
**********************************************************************************/
socket.on('descarga.ok',function(){
	//console.log("PROCESO TERMINADA");
	// se prosigue a eliminar los datos de la colleccion sensores en mongo.
	global.ModelSensores.remove({},function(err){
		if(err){
			console.log("No se elimino los datos de datos mongo");
			global.socketInicio.emit('fallo.descarga');
		}else {
			//console.log("colleccion borrada");

			// sincronizacion Finalizada Correctamente.
			porcentaje=100;
			if(global.socketInicio)
				global.socketInicio.emit('update.porcentaje',porcentaje);
			nfilesEnviados=0;
		}
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
	  // elimina cualquier archivo temporarl que se haya generado.
	  eliminaTemp();
	  global.socketInicio.emit('sincronizacion.falla');
});
/**********************************************************************************
	  Listener de conexion del socket.
**********************************************************************************/
socket.on('connect', function() {
  fs.exists(temp,function(si){
	  if(!si){
		  fs.mkdir(temp,function(err){
			  if(err) throw err;
			  continuaSincronizacion();
		  });
	  }
	  else {
		  continuaSincronizacion();
	  }
  });
  function continuaSincronizacion(){
	  if(!isConectedSinc){
		  isConectedSinc=true;
		  console.log( "SINCRONIZACION LISTO - conectado para sincronizar datos");
		  socket.emit('ambulancia',global.IDConfig);
	  }
  }
});
/**********************************************************************************
	  Listener de desconexion del socket.
**********************************************************************************/
socket.on('disconnect',function(){
	console.log("Se desconecto el socket sincronizacion.......");
	isConectedSinc=false;
	eliminaTemp();
	global.socketInicio.emit('sincronizacion.falla');
});




//var valorExportado = concat.readFile(PathTemp+"Amb01/"+"ready.txt");
//console.log("valor leido: "+ valorExportado);