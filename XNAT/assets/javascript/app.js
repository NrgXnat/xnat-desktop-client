/*!
 * jquery.checkboxall - Turn on/off all checkbox in the container. Required jQuery 1.6 or above
 *
 * @version v1.0
 * @homepage http://neeed.us/
 * @demo: http://neeed.us/plugins/jquery.checboxall/
 * @author Norbert Bracsok <norbert@neeed.us>
 * Licensed under the MIT license
 */

 (function($) {
  'use strict';
  
  if(typeof jQuery === "undefined") {
    console.log('jquery.checkboxall plugin needs the jquery plugin');
    return false;
  }
  
  $.fn.checkboxall = function(allSelector) {

    if (allSelector === undefined) {
      allSelector = 'all';
    }
    
    var parent  = this;
    
    if ($('.' + allSelector, parent).length) {
      var all       = $('.' + allSelector, parent),
      checkbox    = parent.find('input[type="checkbox"]'),
      childCheckbox = checkbox.not('.' + allSelector, parent);

      return checkbox
      .unbind('click')
      .click(function(event) {
        event.stopPropagation();
        
        var th  = $(this);

        if (th.hasClass(allSelector)) {
          checkbox.prop('checked', th.prop('checked'));
        }
        else {
          if (childCheckbox.length !== childCheckbox.filter(':checked').length) {
            all.prop('checked', false);
          }
          else {
            all.prop('checked', true);
          }
        }
      });
    }
    else {
      console.log('jquery.checkboxall error: main selector is not exists.');
      console.log('Please add \'all\' class to first checkbox or give the first checkbox a class name and enter the checkboxall() functions for the class name!');
      console.log('Example: $(selector).checkboxall(\'your-checkbox-class-name\');');
    }
  };
}(jQuery));
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
  // Filter list

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

  $("#file-format-filter").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $("#scan-format li a").filter(function() {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
    });
  });

  $("#file-type-filter").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $("#scan-type li a").filter(function() {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
    });
  });

  // Datepicker

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

  // Select all

    $('.datalist-1').checkboxall('select-format');
    $('.datalist-2').checkboxall('select-type');


  // Upload

    (function(){
      var files, 
      file, 
      extension,
      input = document.getElementById("fileURL"), 
      output = document.getElementById("fileOutput");

      input.addEventListener("change", function(e) {
        files = e.target.files;
        console.log(e);
        output.innerHTML = "";

        for (var i = 0, len = files.length; i < len; i++) {
          file = files[i];
          extension = file.name.split(".").pop();
          output.innerHTML += "<li class='type-" + extension + "'>" + webkitdirectory + "</li>";
        }
      }, false);
    })();

    

  });
