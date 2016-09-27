$(document).ready(function() {
	$("#facebook").on("click", function(){
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		var login = window.open("/auth/facebook", 'facebook', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=350');
		var pollTimer = window.setInterval(function() {
			if (login.closed !== false) {
				window.clearInterval(pollTimer);
				if ($("#facebook").attr('data-product'))
					window.location.href = "/checkout?product_id="+$("#facebook").data('product');
                else if ($('#facebook').attr('data-mall'))
                    window.location.href = "/mall/checkout";
				else
					location.reload();
			}
		}, 200);
	});
	
	$("#google").on("click", function(){
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		var login = window.open("/auth/google", 'google', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=450');
		var pollTimer = window.setInterval(function() {
			if (login.closed !== false) {
				window.clearInterval(pollTimer);
				if ($("#google").attr('data-product'))
					window.location.href = "/checkout?product_id"+$("#google").data('product');
                else if ($('#google').attr('data-mall'))
                    window.location.href = "/mall/checkout";
				else
					location.reload();
			}
		}, 200);
	});
	
	$('#sharefb').on("click", function() {
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		window.open("https://www.facebook.com/dialog/share?app_id=1216374348393191&display=popup&href="+location.href+"&redirect_uri="+location.href, 'facebook', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=350');
	});
	
});