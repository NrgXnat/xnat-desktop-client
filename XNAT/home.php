<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

  <header>
   <div class="container-fluid">
    <a href="#" class="logo-header"><img src="assets/images/logo-header.png"></a>
    <div class="menu-holder">
      <a href="#" class="menu">MENU</a>
      <div class="menu-dropdown">
        <a href="#">Home</a>
        <a href="#">Upload</a>
        <a href="#">Download</a>
        <a href="#" class="monitor">Monitor</a>
      </div>
    </div>

    <a href="#" class="settings"><i class="fas fa-cog"></i></a>
    <div class="user-holder">
    <a href="#" class="user"><span class="name">Welcome Admin</span> <i class="fas fa-user-md"></i></a>
    <div class="user-dropdown">
     <span class="username">
     admin@xw2017-01.xnat.org
     </span>
     <button class="btn btn-darkblue">Logout</button>
    </div>
    </div>
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
       <button class="btn btn-lightblue btn-lg btn-block home-button" type="button" ><span class="upload"></span> Upload files</button>
       <button class="btn btn-lightblue btn-lg btn-block home-button" type="button" ><span class="download"></span> Download files</button>
       <button class="btn btn-lightblue btn-lg btn-block home-button" type="button" ><span class="history"></span> Transfer history</button>
     </div>
     <div class="col"></div>
   </div>
 </div>
</div>


<?php include_once "include/footer.php"; ?>