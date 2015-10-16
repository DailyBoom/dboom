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
				else
					location.reload();
			}
		}, 200);
	});
	
	$("#kakao").on("click", function(){
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		var login = window.open("/auth/kakao", 'kakao', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=350');
		var pollTimer = window.setInterval(function() {
			if (login.closed !== false) {
				window.clearInterval(pollTimer);
				if ($("#kakao").attr('data-product'))
					window.location.href = "/checkout?product_id"+$("#kakao").data('product');
				else
					location.reload();
			}
		}, 200);
	});
});