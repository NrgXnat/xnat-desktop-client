<!DOCTYPE html>
<html lang="en">
<?php include_once "include/header.php"; ?>
<body>

<header>
    <a href="connection-settings.php" class="settings"><i class="fas fa-cog"></i></a>
</header>
<div class="container">
	<div class="logo text-center col-md-12">
		<img src="assets/images/xnat_logo.svg"/>
	</div>
	<div class="col-md-12">
		<div class="row">
		<div class="col"></div>
		<div class="col-8">
    <a href="login.php" style="display: block">Login first time</a>
    <a href="login-known.php" style="display: block">Login repeated</a>
    <a href="connection-settings.php" style="display: block">Connection settings</a>
		<a href="home.php" style="display: block">Home</a>
		</div>
		<div class="col"></div>
		</div>
	</div>
</div>
<?php include_once "include/footer.php"; ?>