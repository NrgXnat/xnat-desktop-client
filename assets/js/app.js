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


	/*
	$(document).on('change', ':file', function () {
		var input = $(this),
			numFiles = input.get(0).files ? input.get(0).files.length : 1,
			label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
		input.trigger('fileselect', [numFiles, label]);
	});
	*/

	/*
	// We can watch for our custom `fileselect` event like this
	$(document).on('fileselect', ':file', function (event, numFiles, label) {
		var input = $(this).parents('.input-group').find(':text'),
			log = numFiles > 1 ? numFiles + ' files selected' : label;

		if (input.length) {
			input.val(log);
		} else {
			if (log) alert(log);
		}
	});
	*/

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
	
	$("#datepicker").datepicker({
		changeMonth: true,
		changeYear: true,
		beforeShow: function (input, inst) {
			var dp = $(inst.dpDiv);
			var offset = $(input).outerWidth(false) - dp.outerWidth(false);
			dp.css('margin-right', offset);
		}
	});

	$(document).on('click', '.js_modal_form_submit', function(e){
		$(this).closest('.modal').find('form').eq(0).trigger('submit');
	});


	/*
	$('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
		e.target // newly activated tab
		e.relatedTarget // previous active tab
		$('table').bootstrapTable('resetView');
	})
	*/

	/*
	$(document).on('shown.bs.tab', 'a[data-toggle="tab"]', function (e) {
		alert('adf')
		e.target // newly activated tab
		e.relatedTarget // previous active tab
		$('table').bootstrapTable('resetView');
	})
	*/
	$(document).on('shown.bs.tab', function (e) {
		$('.bootstrap-table table').bootstrapTable('resetView');
	});
	
	/*
	//upload ?
	(function () {
		var files,
			file,
			extension,
			input = document.getElementById("fileURL"),
			output = document.getElementById("fileOutput");

		input.addEventListener("change", function (e) {
			files = e.target.files;
			output.innerHTML = "";

			for (var i = 0, len = files.length; i < len; i++) {
				file = files[i];
				extension = file.name.split(".").pop();
				output.innerHTML += "<li class='type-" + extension + "'>" + file.name + "</li>";
			}
		}, false);
	})();
	*/
});

