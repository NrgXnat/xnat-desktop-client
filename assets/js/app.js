$(document).ready(function() {
	$(".menu").click(function(){
	    $(".menu-dropdown").toggle();
	});
	$(".user").click(function(){
	    $(".user-dropdown").toggle();
	});
	$(document).click(function(){
	  $(".menu-dropdown").hide();
	  $(".user-dropdown").hide();
	});
	$(".menu-holder, .user-holder").click(function(e){
	  e.stopPropagation();
	});
	$('.alert').alert()
});
