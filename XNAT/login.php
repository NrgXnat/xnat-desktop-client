<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

<header>
	<div class="container-fluid">
		<a href="#" class="settings"><i class="fas fa-cog"></i></a>
	</div>	
</header>
<div class="container">
	<div class="logo text-center col-md-12">
		<img src="assets/images/xnat_logo.jpg"/>
	</div>
	<div class="col-md-12">
		<div class="row">
		<div class="col"></div>
		<div class="col-8">
			<button class="connect btn btn-green btn-lg btn-block" type="button" data-toggle="modal" data-target="#login"><span class="plus"></span><span class="db"></span> CONNECT TO XNAT SERVER</button>
		</div>
		<div class="col"></div>
		</div>
	</div>
</div>
<!-- Modal -->
<div class="modal fade" id="login" tabindex="-1" role="dialog" aria-labelledby="loginTitle" aria-hidden="true">
  <div class="modal-dialog modal-dialog-centered modal-lg" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLongTitle">User login</h5>
        </button>
      </div>
      <div class="modal-body">
      <div class="alert alert-secondary text-center" role="alert">
      	<h2 class="red-title"><i class="fas fa-exclamation-triangle"></i> Warning login failed !</h2>
		  Upload / Download for user (user name) on server (server) failed.</br>
			After (NN) login attempts, your user account will be locked.
		</div>
         <form>
          <div class="form-group">
            <label for="server-name" class="col-form-label">Server:</label>
            <input type="text" class="form-control" id="server-name">
          </div>
          <div class="form-group">
            <label for="user-name" class="col-form-label">Username:</label>
            <input type="text" class="form-control" id="user-name">
          </div>
          <div class="form-group">
            <label for="password" class="col-form-label">Password:</label>
            <input type="password" class="form-control" id="password">
          </div>
        </form>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-gray" data-dismiss="modal">Cancel</button>
        <button type="button" class="btn btn-blue">Verify</button>
      </div>
    </div>
  </div>
</div>

<?php include_once "include/footer.php"; ?>