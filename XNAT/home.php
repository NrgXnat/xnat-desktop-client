<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

  <header>
    <a href="home.php" class="logo-header"><img src="assets/images/logo-header.png"></a>
    <div class="menu-holder">
      <a href="#" class="menu">MENU</a>
      <div class="menu-dropdown">
        <a href="home.php">Home</a>
        <a href="upload.php">Upload</a>
        <a href="download.php">Download</a>
        <a href="monitor.php" class="monitor">Monitor</a>
      </div>
    </div>
    <div class="server-name">XNATserver1.com</div>
    <a href="connection-settings.php" class="settings"><i class="fas fa-cog"></i></a>
    <div class="user-holder">
    <a href="#" class="user"><span class="name">Welcome Admin</span> <i class="fas fa-user"></i></a>
    <div class="user-dropdown">
     <span class="username">
     admin@xw2017-01.xnat.org
     </span>
     <a class="btn btn-blue" href="login-known.php">Logout</a>
    </div>
    </div>
</header>
<div class="container-fluid">
  <div class="logo text-center col-md-12">
    <img src="assets/images/xnat_logo.svg"/>
  </div>
  <div class="col-md-12">
    <div class="row">
      <div class="col"></div>
      <div class="col-8">
        <div class="alert alert-danger text-center alert-dismissible fade show" role="alert">
        <button type="button" class="close" data-dismiss="alert" aria-label="Close">
          <span aria-hidden="true">&times;</span>
        </button>
          <h2 class="red-title"><i class="fas fa-minus-circle"></i> Warning upload / download session failed !</h2>
          Upload / Download for user (user name) on server (server) failed.</br>
          Please check your monitor/log for details.
        </div>
        </div>
     <div class="col"></div>
   </div>
 </div>
 <div class="row">
 <div class="col-sm"><button class="btn btn-bigfriendly btn-lg btn-block home-button" type="button" ><span class="upload"></span> Upload files</button></div>
 <div class="col-sm"><button class="btn btn-bigfriendly btn-lg btn-block home-button" type="button" ><span class="download"></span> Download files</button></div>
 <div class="col-sm"><button class="btn btn-bigfriendly btn-lg btn-block home-button" type="button" ><span class="history"></span> Transfer history</button></div>
 </div>
</div>



<?php include_once "include/footer.php"; ?>