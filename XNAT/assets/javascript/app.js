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

  $(document).on('change', ':file', function() {
    var input = $(this),
        numFiles = input.get(0).files ? input.get(0).files.length : 1,
        label = input.val().replace(/\\/g, '/').replace(/.*\//, '');
    input.trigger('fileselect', [numFiles, label]);
  });
// We can watch for our custom `fileselect` event like this
  $(':file').on('fileselect', function(event, numFiles, label) {

      var input = $(this).parents('.input-group').find(':text'),
          log = numFiles > 1 ? numFiles + ' files selected' : label;

      if( input.length ) {
          input.val(log);
      } else {
          if( log ) alert(log);
      }

  });
  //Filter list
  $("#upload-project-filter").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $("#upload-project li a").filter(function() {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
    });
  });

    $("#subject-session-filter").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $("#subject-session li a").filter(function() {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
    });
  });
    $( "#datepicker" ).datepicker({
      changeMonth: true,
      changeYear: true,
       beforeShow:function( input, inst )
      {
          var dp = $(inst.dpDiv);
          var offset = $(input).outerWidth(false) - dp.outerWidth(false);
          dp.css('margin-right', offset);
      }
    });

    //upload ?

    (function(){
            var files, 
                file, 
                extension,
                input = document.getElementById("fileURL"), 
                output = document.getElementById("fileOutput");
            
            input.addEventListener("change", function(e) {
                files = e.target.files;
                output.innerHTML = "";
                
                for (var i = 0, len = files.length; i < len; i++) {
                    file = files[i];
                    extension = file.name.split(".").pop();
                    output.innerHTML += "<li class='type-" + extension + "'>" + file.name + "</li>";
                }
            }, false);
})();
});
