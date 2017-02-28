$(document).ready(function() {
	Kakao.init('afdccb328111d08927408cad1957135c');
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
	
	$("#kakao").on("click", function(){
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		var login = window.open("/auth/kakao", 'kakao', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=350');
		var pollTimer = window.setInterval(function() {
			if (login.closed !== false) {
				window.clearInterval(pollTimer);
				if ($("#kakao").attr('data-product'))
					window.location.href = "/checkout?product_id"+$("#kakao").data('product');
                else if ($('#kakao').attr('data-mall'))
                    window.location.href = "/mall/checkout";
				else
					location.reload();
			}
		}, 200);
	});
	
	$('#sharefb').on("click", function() {
		var winTop = (screen.height / 2) - (350 / 2);
		var winLeft = (screen.width / 2) - (600 / 2);	
		window.open("https://www.facebook.com/dialog/share?app_id=636096523200038&display=popup&href="+location.href+"&redirect_uri="+location.href, 'facebook', 'top=' + winTop + ',left=' + winLeft +',toolbar=0,status=1,width=600,height=350');
	});
	
	$("#sharekakao").click(function(){
		Kakao.Link.sendTalkLink({
			label: "Dr. Pelo: 오늘 뭐 사지?",
			image: {
				src: "http://dailyboom.co/images/meta.jpg",
				width: 1200,
				height: 600
			},
			webButton: {
				text: '글 보기',
				url: "http://dailyboom.co"
			}
		});
	});
});