$(function () {
	$(".menu").click(function () {
		$(".menu-dropdown").toggle();
	});

	$(".user").click(function () {
		if ($('#menu--username-server').text().length > 0) {
			$(".user-dropdown").toggle();
		}
	});

	$(document).click(function () {
		$(".menu-dropdown").hide();
		$(".user-dropdown").hide();
	});

	$(".menu-holder > a, .user-holder > a").click(function (e) {
		e.stopPropagation();
	});

	$('.alert').alert();


	//Filter list
	$(document).on("keyup", "#upload-project-filter", function () {
		var value = $(this).val().toLowerCase();
		$("#upload-project li a").filter(function () {
			$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
		});
	});

	$(document).on("keyup", "#subject-session-filter", function () {
		var value = $(this).val().toLowerCase();
		$("#subject-session li a").filter(function () {
			$(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
		});
	});

	$(document).on('click', '.js_modal_form_submit', function(e){
		$(this).closest('.modal').find('form').eq(0).trigger('submit');
	});



	$(document).on('shown.bs.tab', function (e) {
		$('.bootstrap-table table').bootstrapTable('resetView');
	});
	

});

